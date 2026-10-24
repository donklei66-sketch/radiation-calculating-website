# 空间热舒适可视化设计工作台 · 1022

[在线使用](https://donklei66-sketch.github.io/radiation-calculating-website/) · [下载完整离线包](https://github.com/donklei66-sketch/radiation-calculating-website/releases/download/v1022/1022-release.zip)

网站采用完整的 1022 发行目录，计算在浏览器内完成。`index.html` 与 `1022.html` 内容相同；脚本、人体模型数据、Worker 和验证页面使用相对路径加载。

## 使用

- 在线：打开上方网站链接，建议使用新版 Chrome 或 Edge。
- 离线：下载 Release 中的 `1022-release.zip`，完整解压后，打开 `1022-release/1022.html`。
- 分享：发送在线链接或完整 ZIP。请保留所有配套文件及目录结构。

## 本版内容

保留空间辐射、16 节段人体模型及透窗直射分析。M2 根据主动辐射面和温度识别供冷、供热，地板供冷同时保留短时与长时判据；三维图可选择时长并按实际温差显示限值面。

完整说明见 [1022-使用说明.md](1022-使用说明.md)。发行文件的大小和 SHA-256 摘要见 [release-manifest.json](release-manifest.json)。

## 发布结构

GitHub Pages 从 `main` 分支根目录发布；`.nojekyll` 保留静态资源原样。后续更新时应替换完整发行目录，并同步更新 `index.html`。ZIP 作为 GitHub Release 附件提供。
