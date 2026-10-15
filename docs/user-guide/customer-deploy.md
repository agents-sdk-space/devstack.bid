# Connect accounts, open PRs and deploy · เชื่อมบัญชี เปิด PR และ deploy

DevStack works inside **your own** GitHub and Cloudflare accounts. You connect them once at `/settings/connections`. After that, the chat or the `/projects` page can:
- create repositories
- commit many files in one commit
- open pull requests
- deploy into your account

DevStack ทำงานในบัญชี GitHub และ Cloudflare **ของคุณเอง** ผูกบัญชีครั้งเดียวที่ `/settings/connections` จากนั้นแชตหรือหน้า `/projects` จะสร้าง repo, commit ทีละหลายไฟล์, เปิด PR และ deploy เข้าบัญชีของคุณได้

## GitHub

- **Connect GitHub** asks for `repo`, so DevStack can work with your private repositories.
- **Public repos only** asks for `public_repo` (least privilege). With it, DevStack can't read or write private repositories.
- **Disconnect** revokes the OAuth grant at GitHub and deletes the stored token.

Safety rules:
- DevStack never pushes straight to your default branch. Changes go to a `devstack/…` branch and a pull request.
- DevStack never writes `.github/workflows/` or `.git/`.

ปุ่ม "เฉพาะ repo สาธารณะ" ขอสิทธิ์น้อยที่สุด ส่วนปุ่มยกเลิกการเชื่อมต่อจะเพิกถอนสิทธิ์ที่ GitHub และลบ token ทันที

## Cloudflare token

Create the token at dash.cloudflare.com → My Profile → API Tokens → **Create Custom Token**. Give it only these two permissions:

| Permission | Access |
|---|---|
| Account · **Workers Scripts** | Edit |
| Account · **Account Settings** | Read |

1. Limit the token to one account and copy it.
2. Copy your **Account ID** from the Workers overview page.
3. Paste both into `/settings/connections` and click **Verify & save**.

DevStack checks the token with `GET /user/tokens/verify` and checks the account with `GET /accounts/{id}`, both before saving.

สร้าง token แบบ Custom ให้สิทธิ์แค่ Workers Scripts: Edit และ Account Settings: Read แล้ววางพร้อม Account ID ระบบจะตรวจกับ Cloudflare ก่อนบันทึก

## Deploying

The page [deploy-templates.md](../deploy-templates.md) shows how each template deploys.
- **Direct deploy** handles static sites and plain JavaScript Workers. DevStack uploads them into your account and shows the `*.workers.dev` URL.
- **Deploy to Cloudflare** is for projects that need a build, such as Next.js or Vite. Cloudflare builds those from your repo. It works for public repos only; for a private repo, connect it in Workers Builds instead.
- **Prepare for Cloudflare** opens a PR that adds the config files the project still needs.

Daily limits per account: 5 new repos, 30 pull requests and 20 deploys. Each project can run only one deploy at a time.

If a deploy fails, ask Dev Chat to fix it:
1. It reads the cleaned-up error log (tokens removed).
2. It commits a fix to a branch, with at most 3 attempts.
3. It shows a **Retry deploy** button. Nothing is redeployed until you click it.

ถ้า deploy ล้มเหลว ให้ Dev Chat อ่าน log (ตัด token ออกแล้ว) แก้โค้ดลงสาขาใหม่ได้สูงสุด 3 ครั้ง แล้วคุณกด Retry deploy เอง

## Privacy · ความเป็นส่วนตัว

- Keys and tokens are encrypted on the server with AES-GCM, using a dedicated key and bound to your account.
- They are never shown again. You only ever see the last 4 characters.
- They are never logged and never sent to the AI model.
- Remove any connection at any time. Deleting your account deletes all of them, along with your projects, deployments and audit events.
- The audit log on `/settings/connections` records event types only (for example "credential.saved" or "deploy.live"), never secrets.

คีย์ทั้งหมดเข้ารหัสเก็บฝั่งเซิร์ฟเวอร์ แสดงแค่ 4 ตัวท้าย ไม่บันทึกลง log และไม่ส่งให้โมเดล AI ลบได้ทุกเมื่อ และถูกลบทั้งหมดเมื่อลบบัญชี
