# 从 Cloudflare D1 与 R2 迁移到 VPS

迁移前请保留 Cloudflare 上的原数据，确认 VPS 版内容完整后再决定是否停止旧服务。

## 1. 导出 D1

可以在 Cloudflare 控制台导出 D1 数据库，也可以在安装了 Wrangler 的电脑上执行：

```bash
npx wrangler d1 export 你的数据库名称 --remote --output d1-export.sql
```

将 `d1-export.sql` 安全传到 VPS 的项目目录。导出文件可能含有好友名称和留言，不要提交到公开 Git 仓库。

## 2. 导入 SQLite

首次迁移前先停止 VPS 图库服务：

```bash
docker compose stop app
```

若使用 Docker，可把 SQL 文件复制进容器后导入：

```bash
docker compose cp d1-export.sql app:/app/data/d1-export.sql
docker compose run --rm app node scripts/import-d1.js /app/data/d1-export.sql --force
```

若直接运行 Node：

```bash
node scripts/import-d1.js ./d1-export.sql --force
```

`--force` 会先把已有 `gallery.sqlite` 复制为带时间戳的备用文件，再建立导入后的数据库。已有正式 VPS 数据时，先运行 `node scripts/backup.js`，并确认备份可用。

## 3. 复制 R2 图片

R2 中的对象必须原样复制到 `STORAGE_ROOT`，不能只复制文件名，也不能改变目录层级。数据库中的 `object_key` 例如为：

```text
gallery/图片ID.webp
```

那么 VPS 中对应文件必须是：

```text
data/images/gallery/图片ID.webp
```

可以使用支持 R2/S3 的工具下载整个桶，例如 rclone：

```bash
rclone copy 你的R2远端:你的桶名 ./data/images --progress
```

若使用 Docker 命名卷，可先下载到 VPS 临时目录，再复制进容器：

```bash
docker compose cp ./下载好的图片目录/. app:/app/data/images/
```

无论使用哪种方法，都要保留对象键中的中文目录、`gallery/` 目录和文件扩展名。

## 4. 保留好友登录

把旧 Cloudflare Pages 中使用的 `FRIEND_ID_SECRET` 原值填入 VPS 的 `.env`。如果使用了新值，旧好友记录中的学号 HMAC 将无法匹配，管理员需要在后台为每位好友重新设置学号。

已经登录的浏览器 Cookie 不会从 Pages 自动迁移到 VPS；好友需要在 VPS 站点重新登录一次。

## 5. 启动并核对

```bash
docker compose up -d
```

依次检查：

1. `/healthz` 显示数据库和图片存储正常；
2. 首页分组和图片数量与旧站一致；
3. 随机抽查几张图片能打开；
4. `/admin/` 能编辑并保存；
5. 好友能登录并读取、发表留言；
6. 在后台上传一张测试图，再确认首页能显示。

确认完成后再切换域名解析。建议先降低 DNS TTL，并在切换前为旧站和 VPS 各保留一份独立备份。
