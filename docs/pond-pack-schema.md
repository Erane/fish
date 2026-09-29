# 池塘包（Pond Pack）数据格式

用户可上传自定义底图替换默认池塘。底图本身不含空间信息，需要一份「池塘包」描述水面范围、深度、障碍与动物锚点，鱼和动物才不会冲出池塘。

- 权威类型定义（SSOT）：`src/core/pack.ts` 的 `PondPack`。本文只补充类型无法表达的坐标语义与外部 AI 生产流程，字段结构以代码为准。
- 校验入口：`parsePack()`（同文件）。不合法的包会被拒绝，回退默认池塘。
- 加载链路：`src/data/packs.ts` `resolvePack()` → `src/render/pondBed.ts` `packBed()`。

## 生产方式

用户把底图交给任意多模态 AI，连同下面的提示词，让 AI 回填 JSON。图片本体单独存为二进制资产，JSON 里用 `image` 字段引用其资产 id。

## 坐标语义（类型里没有的关键约定）

- 所有坐标归一化到 `[0,1]`，原点左上，相对**整张底图**（不是相对水面）。
- `water.polygon`：水面轮廓，扁平数组 `[x0,y0,x1,y1,...]`，至少 3 个点（6 个数），按顺序连成闭合多边形。鱼被约束在此多边形内；水面效果（焦散/折射/天光反射/深水色）也仅作用于此多边形内（遮罩生成见 `pondBed.ts` `waterMask`）。
- `water.depth`：`w×h` 栅格，`data` 长度必须等于 `w*h`，每格 `[0,1]`，0=最浅/岸边，1=最深。覆盖整张图，按 `x*w` 展开。建议 `w` 取 96~176。
- `water.obstacles`：鱼会绕开的圆形障碍（石头、大荷叶），`r` 为归一化半径。
- `water.anchors`：动物锚点，均归一化坐标。`crabHomes`（蟹窝，`rx/ry` 为椭圆半径）、`spots`（蜻蜓/萤栖点 `[x,y]`）、`buds`（花苞点，供昆虫停靠）。留空则不出现对应动物。
- `seasons`：四季各一份资产，至少一份。缺某季时按 `pickSeason()` 就近回退。季节由当前日期自动决定（`seasonForDate()`：3-5 春 / 6-8 夏 / 9-11 秋 / 12-2 冬）。
- `tint.water`：`#rrggbb`，该季水色微调，叠加到天气/昼夜的水色上。

## 给外部 AI 的提示词

单一来源：`src/data/packPrompt.ts` 的 `PACK_PROMPT`（含结构示例）。「底图」面板的「复制提示词」按钮复制的即此文本。本文不重复其内容，以免分叉。

## 存储

- IDB `pond`（v2）：`packs` store 存 `PondPack` JSON，`assets` store 存图片 Blob（键 = `image` 字段值）。见 `src/data/db.ts`。
- 当前启用哪个包：`save.packId`（`src/core/save.ts` 校验）。缺省或加载失败则用内置默认池塘（`builtinBed()`）。
- 导入 / 启用 / 删除入口：顶栏「底图」面板（`src/ui/panels.ts` 的 `renderPond`）。导入时资产 id 由 `seasonAssetId()` 生成（`src/data/packs.ts`），即 `asset-{packId}-{season}`。

## 画风

`style` 为自由字符串标签（`cel`/`realistic`/`anime`…），仅用于分类展示，不影响渲染。画风由底图与（未来的）精灵贴图本身决定。精灵贴图自定义属后续里程碑，本轮不涉及。
