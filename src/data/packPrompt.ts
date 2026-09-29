export const PACK_PROMPT = `这是一张池塘俯视图。请观察图中的水面区域，只输出一份 JSON（不要任何解释文字），供程序约束鱼群活动范围与渲染。要求：

1. water.polygon：沿水陆交界描出水面轮廓。归一化坐标（左上 0,0，右下 1,1，相对整张图而非水面），按顺序连成闭合多边形，20~40 个点，写成扁平数组 [x0,y0,x1,y1,...]。
2. water.depth：深度栅格 { "w", "h", "data" }。w 取 128，h 按图片宽高比取整；data 是长度 w*h 的 0~1 数组（按行展开），岸边接近 0、水心接近 1，陆地格填 0。
3. water.obstacles：水面上鱼应绕开的石头、大荷叶等，给归一化圆心与半径 { "x", "y", "r" }；没有则空数组。
4. water.anchors：动物锚点，均归一化坐标。crabHomes 为岸边蟹窝 { "x", "y", "rx", "ry" }；spots 为蜻蜓/流萤可停的荷叶 [x,y]；buds 为花苞 [x,y]；没有则留空数组。
5. seasons：至少一个季节（spring/summer/autumn/winter），每季 { "image", "tint": { "water" } }。image 填该季图片的文件名占位（图片二进制由程序另行绑定）；tint.water 为该季水色 #rrggbb。
6. 顶层字段：format 固定 1；id 为小写短横线标识；name 为展示名；style 为画风标签（cel/realistic/anime 等）。

结构示例：
{
  "format": 1,
  "id": "my-pond",
  "name": "我的池塘",
  "style": "realistic",
  "water": {
    "polygon": [0.18,0.22, 0.52,0.14, 0.84,0.26, 0.90,0.60, 0.70,0.86, 0.34,0.88, 0.14,0.62],
    "depth": { "w": 4, "h": 4, "data": [0,0,0,0, 0,0.6,0.6,0, 0,0.6,1,0, 0,0,0,0] },
    "obstacles": [{ "x": 0.40, "y": 0.50, "r": 0.06 }],
    "anchors": {
      "crabHomes": [{ "x": 0.25, "y": 0.70, "rx": 0.05, "ry": 0.04 }],
      "spots": [[0.60, 0.40]],
      "buds": [[0.62, 0.38]]
    }
  },
  "seasons": {
    "summer": { "image": "summer.png", "tint": { "water": "#7fa88c" } }
  }
}`;
