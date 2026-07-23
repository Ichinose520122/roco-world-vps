# 一ノ瀬林檎的小洛克冒险之旅（VPS 版）

这是从 Cloudflare Pages + D1 + R2 版本转换而来的单机 VPS 版本。现有首页、管理后台、批量上传与编辑、分组、置顶、精选、标题图、好友登录和照片留言功能均保留。

## VPS 版使用什么

- 网页与接口：Node.js 24 LTS
- 数据库：VPS 本地 SQLite，默认位于 `data/gallery.sqlite`
- 图片：VPS 本地目录，默认位于 `data/images/`
- 后台登录：HTTPS 下的 HTTP Basic Auth
- 反向代理与 HTTPS：默认提供 Caddy，也附带 Nginx 和 systemd 示例

项目没有第三方 npm 依赖，不需要运行 `npm install`。首次启动时会自动创建数据库和默认分组。

部分 Node.js 24 小版本会在启动时输出一行 `SQLite is an experimental feature` 提示；这不是运行失败，也不会影响本项目的自检结果。

## 最简单的部署方式：Docker Compose

准备一台安装了 Docker 与 Docker Compose 的 Linux VPS，并确保域名已经解析到 VPS。

```bash
cp .env.example .env
```

编辑 `.env`，至少修改下面四项：

```dotenv
DOMAIN=roki.example.com
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请填写至少16位的随机密码
FRIEND_ID_SECRET=请填写至少32位且以后不要更换的随机值
```

然后启动：

```bash
docker compose up -d --build
```

访问：

- 首页：`https://你的域名/`
- 管理后台：`https://你的域名/admin/`
- 健康检查：`https://你的域名/healthz`

Caddy 会自动申请并续期 HTTPS 证书。后台第一次打开时，浏览器会要求输入 `.env` 中的管理员用户名和密码。

### Docker 常用命令

```bash
# 查看状态
docker compose ps

# 查看日志
docker compose logs -f app

# 修改代码或配置后重建
docker compose up -d --build

# 停止
docker compose down

# 创建数据库与图片备份
docker compose exec app node scripts/backup.js
```

图库数据保存在 Docker 命名卷 `gallery_data` 中。不要使用 `docker compose down -v`，其中的 `-v` 会删除图库数据卷。

## 不使用 Docker：直接运行

需要 Node.js 24 LTS。将项目放到 `/opt/roco-gallery` 后：

```bash
cd /opt/roco-gallery
cp .env.example .env
# 编辑 .env 后先试运行
node server/server.js
```

确认 `http://127.0.0.1:3000/healthz` 返回 `ok: true` 后，可使用：

- `deploy/roco-gallery.service` 注册 systemd 服务；
- `deploy/Caddyfile` 反向代理并自动配置 HTTPS；或
- `deploy/nginx.conf` 配合 Nginx 与已有证书。

以 systemd 为例：

```bash
sudo useradd --system --home /opt/roco-gallery --shell /usr/sbin/nologin roco-gallery
sudo chown -R roco-gallery:roco-gallery /opt/roco-gallery
sudo cp deploy/roco-gallery.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now roco-gallery
sudo systemctl status roco-gallery
```

若选择 Caddy，把 `deploy/Caddyfile` 第一行改成正式域名后复制到 Caddy 的配置位置并重载：

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

直接运行时，请让服务用户拥有 `data/` 目录的读写权限。不要将 Node 的 3000 端口直接暴露到公网，只对外开放反向代理的 80 和 443 端口。

## 配置说明

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Node 监听地址；Docker 会覆盖为 `0.0.0.0` |
| `PORT` | `3000` | Node 监听端口 |
| `DATA_DIR` | `./data` | 数据根目录 |
| `DB_PATH` | `./data/gallery.sqlite` | SQLite 数据库文件 |
| `STORAGE_ROOT` | `./data/images` | 本地图片目录 |
| `BACKUP_DIR` | `./data/backups` | 备份输出目录 |
| `ADMIN_USERNAME` | `admin` | 后台用户名 |
| `ADMIN_PASSWORD` | 无 | 后台密码，必须至少 16 位 |
| `FRIEND_ID_SECRET` | 无 | 好友学号 HMAC 密钥，至少 16 位，建议 32 位以上 |
| `FRIEND_SESSION_DAYS` | `30` | 好友登录保持天数，范围 1～90 |
| `MAX_UPLOAD_BYTES` | `26214400` | 单张上传上限，默认 25 MiB |
| `MAX_REQUEST_BYTES` | `28311552` | 单个 HTTP 请求体上限 |
| `CACHE_MAX_BYTES` | `67108864` | 进程内公开数据缓存上限 |

不要提交 `.env`。更换 `FRIEND_ID_SECRET` 会导致现有好友学号摘要无法再匹配，需要在后台重新填写学号。

## 从现有 D1 与 R2 搬迁

若要保留线上图库数据，必须同时迁移：

1. D1 导出的 SQL 数据；
2. R2 中的全部图片对象，并保留原始对象键和目录层级。

完整步骤见 [MIGRATION.md](docs/MIGRATION.md)。

如果暂时不搬旧数据，直接启动即可得到空图库；随后可从管理后台重新上传。

## 数据备份与恢复

```bash
node scripts/backup.js
```

它会把一致性的 SQLite 备份和全部图片复制到 `BACKUP_DIR/时间戳/`。`.env` 不会被复制，请另行加密保存。

恢复时先停止服务，再用备份中的 `gallery.sqlite` 和 `images/` 替换当前数据，确认权限后重启。

## 项目结构

```text
public/                  首页与管理后台
functions/               沿用并复用的业务接口
server/                  VPS HTTP、SQLite、本地存储与路由适配层
scripts/                 备份和 D1 导入工具
tests/                   VPS 运行时集成测试
deploy/                  systemd 与 Nginx 示例
data/                    运行后生成，不提交到 Git
Dockerfile
compose.yaml
Caddyfile
```

## 安全与运行边界

- 管理后台必须通过 HTTPS 使用；Basic Auth 本身不加密传输内容。
- 图片公开接口仍只暴露 `/gallery/{ID}`，不会把本地对象路径或原始文件名发送给首页。
- 管理接口、上传接口和管理后台均要求管理员认证。
- 好友学号继续以 HMAC 保存；留言仍有原项目的登录失败、频率和重复内容限制。
- SQLite 适合单台 VPS。不要让多台应用服务器同时通过网络共享盘读写同一个数据库。
- 建议同时配置 VPS 防火墙、定期备份，并限制只有 80/443 和管理所需的 SSH 端口可从公网访问。

## 本地自检

```bash
node --test tests/*.test.js
```

测试会在临时目录中验证自动建表、后台上传、图库读取和图片输出，不会修改正式 `data/`。
