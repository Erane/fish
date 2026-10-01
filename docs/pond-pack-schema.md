# 池塘包（Pond Pack）数据格式

用户可上传自定义底图替换默认池塘。底图本身不含空间信息，需要一份「池塘包」描述水面范围、深度、障碍与动物锚点，鱼和动物才不会冲出池塘。

- 权威类型定义（SSOT）：`src/core/pack.ts` 的 `PondPack`。本文只补充类型无法表达的坐标语义与外部 AI 生产流程，字段结构以代码为准。
- 校验入口：`parsePack()`（同文件）。不合法的包会被拒绝，回退默认池塘。
- 加载链路：`src/data/packs.ts` `resolvePack(packId, skinBindings)` 一次产出池底与皮肤 → `src/render/pondBed.ts` `packBed()`、`src/art/skin.ts` `buildPackSkins()`。
- 皮肤不属于包：包只描述底图与水域，鱼贴图是全局皮肤库加存档绑定，见「皮肤库与绑定」节。

## 生产方式

用户把底图交给任意多模态 AI，连同下面的提示词，让 AI 回填 JSON。图片二进制不进 JSON：`image` 只是文件名占位，导入时由 `seasonAssetId()` 生成资产键并绑定用户在面板上选的那张图。

## 坐标语义（类型里没有的关键约定）

- 所有坐标归一化到 `[0,1]`，原点左上，相对**整张底图**（不是相对水面）。
- `water.polygon`：水面轮廓，扁平数组 `[x0,y0,x1,y1,...]`，至少 3 个点（6 个数），按顺序连成闭合多边形。鱼被约束在此多边形内；水面效果（焦散/折射/天光反射/深水色）也仅作用于此多边形内（遮罩生成见 `pondBed.ts` `waterMask`）。
- 深度场不进包：由 `water.polygon` 在 `packBed()` 加载时经 `depthFromPolygon()`（`src/core/depth.ts`）按离岸距离派生，域内归一化 [0,1]、域外 0。
- `water.obstacles`：鱼会绕开的圆形障碍（石头、大荷叶），`r` 为归一化半径。
- `water.anchors`：动物锚点，均归一化坐标。`crabHomes`（蟹窝，`rx/ry` 为椭圆半径）、`spots`（蜻蜓/萤栖点 `[x,y]`）、`buds`（花苞点，供昆虫停靠）。留空则不出现对应动物。
- `seasons`：四季各一份资产，至少一份。缺某季时按 `pickSeason()` 就近回退。季节由当前日期自动决定（`seasonForDate()`：3-5 春 / 6-8 夏 / 9-11 秋 / 12-2 冬）。
- `tint.water`：`#rrggbb`，该季水色微调，叠加到天气/昼夜的水色上。

## 给外部 AI 的提示词

单一来源：`src/data/packPrompt.ts`。分三段，对应三种不同性质的任务：

- `BG_PROMPT`：背景图生成（凭空让 AI 画一张池塘俯视图，作底图/壁纸用，无鱼无动物）。
- `PACK_PROMPT`：底图分析（把已做好的底图交给 AI，看图回填水面轮廓/障碍/锚点/季节 JSON，含结构示例）。
- `SKIN_PROMPT`：鱼皮肤生成（凭空画一张透明底、鼻朝右的鱼贴图，与底图无关）。

「池塘」面板对应三个复制按钮（`复制背景图生成提示词` / `复制底图解析提示词` / `复制鱼皮肤提示词`），各带一份可展开只读全文供剪贴板不可用时手抄。本文不重复其内容，以免分叉。

## 存储

- IDB `pond`（v3）：`packs` store 存 `PondPack` JSON，`assets` store 存底图 Blob（键 = `image` 字段值），`skins` store 存 `SkinRecord`（皮肤 Blob 加名称物种）。见 `src/data/db.ts`。
- 当前启用哪个包、绑哪些皮肤：`save.packId` 与 `save.skinBindings`（均在 `src/core/save.ts` 清洗）。缺省或加载失败则用内置默认池塘与程序化锦鲤。
- 导入 / 启用 / 编辑 / 删除入口：顶栏「池塘」面板（`src/ui/panels.ts` 的 `renderPond`）。底图资产 id 由 `seasonAssetId()` 生成（`src/data/packs.ts`），即 `asset-{packId}-{season}`；同 `id` 再次导入即更新该包——JSON 里没选图的季节保留原有资产，JSON 里删掉的季节其资产随之清理（`planSeasonAssets()`）。
- 内置主题：清单 `public/theme/themes.json` 是上架配置的唯一真相源——在清单即上架，删行即下架，无独立开关字段。`src/data/builtinPacks.ts` 负责拉取校验（`parseThemeManifest()`/`loadBuiltinThemes()`）与播种回收：首启由 `seedBuiltinPacks()` 走 `importPack()` 落成普通包，面板上与用户导入的包无异（可换图、可删除）；清单外已播种的主题连同底图资产在启动时自动回收，记账按 url+包 id 存于 IDB `state.seededThemes`（`src/data/db.ts`），故面板手动删除后不复活；记账只在播种成功后写入，取数或导入失败下次启动重试。清单拉取失败或结构非法视为配置状态未知，播种与回收都不执行，避免离线误删。默认启用规则见 `src/main.ts` 的 `boot`：仅无存档的首次启动启用本次新播的第一个包；已有存档则尊重其选择，所选包已被回收时回退默认池塘且回退结果随存档保留。
- `public/theme/**` 不进 PWA precache，仅清单 `theme/themes.json` 例外重包含（`vite.config.ts` 的 `workbox.globIgnores`）：底图首启即复制进 IDB，无需常驻缓存；清单必须离线可读，否则上面那条「状态未知」语义会在离线时跳过播种。

## 画风

`style` 为自由字符串标签（`cel`/`realistic`/`anime`…），仅用于分类展示，不影响渲染。画风由底图与鱼皮肤本身决定。

## 皮肤库与绑定

皮肤是全局资产，不属于任何一个包：一张皮肤可被多个包、多个季节复用。

- 库：`SkinRecord`（`id` / `name` / `species` / `blob`），写入入口只有 `src/data/skins.ts` 的 `addSkin()` / `editSkin()` / `removeSkin()`；空名称回退 `SKIN_UNNAMED`。物种集合 `SKIN_SPECIES`（锦鲤 / 银鲩）。
- 绑定：`save.skinBindings` 是「包 id → 档位 → 物种 → 皮肤 id」的四层映射，档位 `SKIN_TIERS` = 默认 + 四季；内存 SSOT 是 `Persister.skinBindings`（与 `packId` 同款快照），写存档仍走 `writeSave(persister.snapshot())` 唯一入口。
- 回退链：当季档位 → 该包默认档位 → 程序化锦鲤（`art/koi.ts`）。解析在 `resolveSkinBinding()`，增删改与空层级回收在 `withSkinBinding()`，删皮肤 / 删包时按 `pruneSkinBindings()` / `prunePackBindings()` 清引用；绑定字段的纯逻辑全部在 `src/core/skins.ts`。
- 贴图规格：透明背景、俯视平直、**鼻朝右**的单张鱼图。渲染时经 `art/skin.ts` `normalizeSkin()` 裁切铺满鱼体单元格，再由既有脊线切片管线（`renderer.ts` `fish()`）沿脊线逐列采样变形，侧向光照宽度由贴图 alpha 实测（`skinWidths()`）。
- 面板：「池塘」内的皮肤库网格（导入、改名换物种、二次确认删除）与包编辑区（`SKIN_SPECIES × SKIN_TIERS` 下拉，首项「程序化 / 跟随默认」即解绑）。改绑定只热更当前包的皮肤（`applySkins()`，不重载页面），换底图仍需重载。
- 改物种会解除该皮肤的全部绑定（物种与贴图不匹配比错绑更糟），并提示。

皮肤用 `SKIN_PROMPT` 生成，与底图 JSON 完全解耦：底图包不再声明任何皮肤字段。
