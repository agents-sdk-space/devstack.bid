# แผนปรับ UI/UX ทั้งเว็บ · UI/UX revamp plan

สถานะ: **แผนเท่านั้น ยังไม่มีการแก้โค้ด** ทุกเฟสที่เปลี่ยน layout หรือ section ต้องได้รับอนุญาตจากเจ้าของก่อน (AGENTS.md ข้อ 4) ระบบ token, คอมโพเนนต์ และหลักการ v0.5 อ่านได้ที่ [concepts/design-system.md](../concepts/design-system.md) และ [UI-FRAMEWORK.md](../UI-FRAMEWORK.md)

ที่มา: ผู้ประเมินบอกว่าเว็บ "แน่นและรก" เจ้าของต้องการให้ยึด **nextjs.org** เป็นต้นแบบ คือมีที่ว่างเยอะ ลำดับตัวอักษรชัด ใช้ของน้อยอย่างตั้งใจ และแบ่ง section ชัด พร้อมเขียนข้อความหน้าแรกใหม่ให้สั้นและเข้าใจง่ายขึ้น

## 1. วิธีตรวจ (audit)

- ภาพหน้าจอแบบเต็มหน้า (Playwright, `npm run dev`) ที่ 1440px และ 390px เก็บที่ `/workspace/shots/audit/` บนเครื่องทำงาน (ไม่ commit เพราะเป็นภาพก่อนปรับ): `/`, `/templates`, `/builder`, `/chat`, `/login`, `/docs`, `/learn`, `/studio/` และเมนูมือถือ
- `/studio/` ตอบ 404 บน `next dev` เพราะ Studio ถูก build ลง `public/studio/` ตอน `prebuild` เท่านั้น ต้องตรวจซ้ำบน `npm run preview`
- ตัวเลขที่วัดได้ (ความสูงหน้า / จำนวนคำ / จำนวนลิงก์และปุ่ม):

| หน้า | 1440px สูง | 390px สูง | คำ | ลิงก์+ปุ่ม |
|---|---|---|---|---|
| `/` | 2,925 | 5,451 | ~480 | 43 |
| `/templates` | 2,058 | 4,400 | ~446 | 62 |
| `/builder` | 1,640 | 2,052 | ~241 | 40 |
| `/chat` | 900 (เต็มจอ) | 844 | ~214 | 41 |
| `/login` | 1,181 | 1,197 | ~100 | 27 |
| `/docs` | 4,482 | 7,350 | ~774 | 195 |
| `/learn` | 3,968 | 6,220 | ~535 | 42 |

header มีลิงก์และปุ่ม 20 ชิ้นบนทุกหน้า (`/docs` มี 34)

## 2. วินิจฉัย: ความแน่นมาจากไหน

### ทั้งเว็บ

1. **header แน่นเกิน** มีลิงก์หลัก 6 อัน + ปุ่ม Setup Cursor + Sign in + ค้นหา + ภาษา + ธีม + เมนู ทั้งที่จอกว้างพอแล้ว nextjs.org มีลิงก์หลักราว 4–5 อันและปุ่มด้านขวา 2 ชิ้น
2. **ตัวอักษรเล็กและจางเกินไปหลายระดับ** ใช้ 11–13px ปนกันมาก (`text-[11px]`, `text-[12.5px]`, `text-[13px]`) พร้อม `text-muted`/`text-subtle` ทำให้ทุกอย่างดูเท่ากันและอ่านยาก
3. **ป้าย (badge/chip) เยอะเกิน** การ์ดเทมเพลตแต่ละใบมีป้ายหมวด + runtime + ป้ายเครื่องมือ 3–5 อัน + ปุ่มสองปุ่ม ตาต้องสแกนจุดเล็ก ๆ ราว 10 จุดต่อใบ
4. **ไม่มีลำดับความสำคัญของ section** ทุก section ใช้การ์ดขอบเทาบนพื้นดำแบบเดียวกัน ระยะห่าง `py-20` เท่ากันหมด ไม่มี section ไหนเด่น
5. **ซิกเนเจอร์เทอร์มินัลใน footer ทุกหน้า** เป็นภาพใหญ่ที่ไม่เกี่ยวกับงานของหน้านั้น
6. **ข้อความยาวและเป็นศัพท์เทคนิค** เช่น hero subtitle มีชื่อเครื่องมือ 8 ตัวและไฟล์ 2 ชนิดในประโยคเดียว

### รายหน้า

- **หน้าแรก `/`**: hero มี badge + หัวข้อ 3 บรรทัด + คำอธิบายยาว 2 ประโยค + 2 ปุ่ม + หน้าต่างโค้ด + มาสคอตซ้อนทับโค้ด "How it works" เป็นการ์ด 3 ใบที่ข้อความยาวเท่า ๆ กัน ตามด้วยการ์ดเทมเพลต 6 ใบเต็มรายละเอียด (ซ้ำกับ `/templates`) แล้วต่อด้วย "Beyond a landing page" อีก 4 คอลัมน์ บนมือถือหน้ายาว 5,451px
- **`/templates`**: การ์ด 10 ใบแสดงข้อมูลทั้งหมดตั้งแต่แรก แถบตัวกรองมี 10 ชิป ปุ่ม "View steps" กับ "Open in builder" ซ้ำทุกใบ
- **`/builder`**: แถบ stepper 4 ขั้น + แถบ "Current stack" ที่มีชิปอีกหลายอัน + แท็บ + การ์ด AI + ตัวอย่างคำสั่ง 6 ชิป + checkbox + 2 ปุ่ม + กล่องว่าง ทั้งหมดอยู่ใน viewport แรก ลำดับขั้น "1/4 · Start" ซ้ำกับ stepper
- **`/chat`**: (ปรับใน commit `8c0f0eb` แล้ว ให้เต็มจอและ composer อยู่ล่างสุด) ยังเหลือตัวเลือกโมเดล 12 ปุ่มที่เป็นชิปเล็ก ควรเป็น dropdown เดียว
- **`/login`**: โครงดี แต่ปุ่มผู้ให้บริการใช้ตัวอักษรย่อ (C/G/GH) แทนโลโก้ ปุ่ม "Sign in" กับ "Create account" อยู่ในฟอร์มเดียวกันทำให้ไม่รู้ว่ากำลังทำอะไร
- **`/docs`**: 195 ลิงก์ในหน้าเดียว sidebar + เนื้อหา + สารบัญยาว
- **`/learn`**: การ์ด 13 ใบในสามกลุ่ม ตามด้วย "Three ways to start" อีก 3 การ์ด และ Setup Cursor ซ้ำกับปุ่มใน header

## 3. หลักการออกแบบใหม่

1. **หนึ่ง section หนึ่งเรื่อง หนึ่งการกระทำหลัก** ทุก section มีหัวข้อ 1 บรรทัด คำอธิบายไม่เกิน 2 บรรทัด และปุ่มหลักไม่เกิน 1 ปุ่ม
2. **ที่ว่างคือโครงสร้าง** ใช้ระยะห่างแบ่ง section แทนเส้นขอบและการ์ด การ์ดใช้เฉพาะสิ่งที่คลิกได้
3. **ลำดับตัวอักษรชัด 3 ระดับต่อหน้า**: display, หัวข้อ section, เนื้อความ ป้ายเล็กใช้น้อยที่สุด
4. **เปิดเผยทีละชั้น (progressive disclosure)** รายละเอียด (ป้ายเครื่องมือ, OS notes, ตัวเลือกขั้นสูง) ซ่อนไว้จนผู้ใช้ขอดู
5. **ใช้ของเดิม** ใช้ token และคอมโพเนนต์ใน `src/components/ui` ไม่สร้างระบบใหม่ คงพื้นดำ, Inter/IBM Plex Sans Thai, สีฟ้าสองบทบาท และมาสคอตชมพู
6. **สองภาษาเท่ากัน** ข้อความไทยต้องสั้นพอ ๆ กับภาษาอังกฤษ ไม่แปลตรงตัว

## 4. การเปลี่ยน token

แก้ที่ `src/app/tokens.css`, `src/app/globals.css` (`@theme`) และ `src/lib/design-tokens.ts` แล้วเพิ่มคู่สีใน `tests/tokens.test.ts`

### ระยะห่าง

| token ใหม่ | ค่า | ใช้กับ |
|---|---|---|
| `--space-section` | 128px (เดสก์ท็อป) / 80px (มือถือ) | ระยะระหว่าง section แทน `py-20 sm:py-24` |
| `--space-block` | 48px / 32px | หัวข้อ section ถึงเนื้อหา แทน `mt-10` |
| `--container` | 1120px | แทน `max-w-7xl` (1280px) บนหน้าการตลาด เนื้อหาไม่กว้างเกินไป |
| `--measure` | 60ch | ความกว้างสูงสุดของย่อหน้า |

### ขนาดตัวอักษร (type scale)

| ระดับ | เดสก์ท็อป | มือถือ | น้ำหนัก |
|---|---|---|---|
| display | 64px / 1.05 (เดิม) | 40px | 700 |
| h2 section | 40px / 1.1 | 28px | 600 |
| h3 | 20px / 1.3 | 18px | 600 |
| lead | 20px / 1.5 | 17px | 400, `text-muted` |
| body | 16px / 1.6 | 16px | 400 |
| small | 14px | 14px | 400 |
| caption | 13px (mono) | 13px | เฉพาะป้ายและโค้ด |

ยกเลิกขนาดเฉพาะกิจ `text-[10.5px]`, `text-[11px]`, `text-[12.5px]` ใน UI ที่ผู้ใช้อ่าน (เก็บไว้ได้เฉพาะ metadata เช่น ตัวนับตัวอักษร) ภาษาไทยใช้ line-height อย่างน้อย 1.6

### สี

- คงพื้น `bg` ดำและ `primary`/`link` ฟ้าตามเดิม
- ใช้ `text-subtle` เฉพาะ caption ห้ามใช้กับเนื้อความ (ตรวจ AA อีกครั้ง)
- ลดเส้นขอบ: section ใช้พื้นต่างระดับ (`bg` / `surface`) แทน `border-t`
- การ์ดใช้ `border-border` ขอบเดียว ไม่มีเงา และขอบสว่างขึ้นเมื่อ hover

## 5. Header และการนำทาง

- **ลิงก์หลักเหลือ 4 อัน**: Templates, Builder, Chat, Docs ส่วน Functions, Dev Chat, Factory, Agents, Studio, Design ย้ายไปเมนู "More" (เดสก์ท็อป) และเมนูมือถือ
- **ด้านขวาเหลือ 3 ชิ้น**: ค้นหา (`⌘K` แบบช่องค้นหาสั้นเหมือน nextjs.org), Sign in (ข้อความ ไม่มีกรอบ) และปุ่มหลัก "Start building" (ไป `/builder`)
- ปุ่มภาษาและธีมย้ายไป footer และเมนูมือถือ ข้อนี้ต้องให้เจ้าของตัดสินใจ เพราะผู้ใช้ไทยอาจหาปุ่มภาษาไม่เจอ ทางเลือกคือเก็บปุ่มภาษาไว้ใน header แต่ย้ายแค่ปุ่มธีม
- Setup Cursor ย้ายไปอยู่ในเมนู "More" และหน้า `/learn`
- header สูง 64px พื้นโปร่ง blur เส้นล่างแสดงเฉพาะเมื่อเลื่อนหน้าลงแล้ว
- **Footer**: เป็นลิงก์ 4 คอลัมน์ (Product, Resources, Developers, About) และย้ายซิกเนเจอร์เทอร์มินัลไปอยู่ที่ `/learn` กับ `/design#signature` (ต้องได้อนุญาต เพราะ design-system.md ระบุว่าอยู่ทุกหน้า)

## 6. ข้อเสนอรายหน้า

### หน้าแรก `/` (ลดจาก 4 section ที่แน่นเหลือ 5 section ที่โล่ง)

1. **Hero** อยู่กึ่งกลางแบบ nextjs.org มีหัวข้อ, subhead 1 ประโยค, 2 ปุ่ม และบรรทัดคำสั่งที่คัดลอกได้ (`npx create-next-app@latest`) หน้าต่างโค้ดย้ายไปอยู่ใต้ hero และกว้างเต็ม container ส่วนมาสคอตอยู่ข้างหัวข้อ ไม่ทับโค้ด
2. **สามขั้นตอน** เป็นตัวเลขใหญ่กับข้อความ 1 บรรทัด ไม่มีการ์ด
3. **เทมเพลตยอดนิยม** แสดง 3 ใบ เป็นการ์ดแบบย่อ (ชื่อ, คำอธิบาย 1 บรรทัด, runtime) และลิงก์ "ดูทั้งหมด"
4. **สิ่งที่ทำได้** 3 ข้อ (Templates, AI planner, Safe) เป็นหัวข้อสั้นกับประโยคเดียว
5. **CTA ปิดท้าย** หัวข้อเดียวกับปุ่มเดียว

### `/templates`

- การ์ดแบบย่อ: ไอคอน, ชื่อ, คำอธิบาย 1 บรรทัด, runtime ทั้งการ์ดคลิกได้ (ไปหน้า detail) ป้ายเครื่องมือย้ายไปหน้า detail
- ตัวกรองเหลือ "ทั้งหมด / Node.js / Python" + ช่องค้นหา หมวดอื่นย้ายไปเป็น dropdown
- ใช้ 3 คอลัมน์และ gap 24px

### `/builder`

- stepper เป็นแถบบางด้านบน ลบหัวข้อ "1/4 · Start" ที่ซ้ำ
- แถบ "Current stack" ยุบเป็นปุ่ม "Current stack (7 steps)" ที่เปิด drawer ได้
- ตัวอย่างคำขอเหลือ 3 อัน ส่วนตัวเลือก "Use my own OpenAI key" ย้ายไปอยู่ใน "Advanced"
- ไม่แสดงกล่องว่าง "Your plan will appear here" จนกว่าจะส่งคำขอ

### `/chat`

- ตัวเลือกโมเดลเป็น dropdown เดียวในแถบบนของแชต (Select ของ Radix ที่มีอยู่) แทนชิป 12 อัน
- คำแนะนำเริ่มต้นเหลือ 3 อัน

### `/docs`

- sidebar ยุบหมวดเป็นค่าเริ่มต้น แสดงเฉพาะหมวดที่เปิดอยู่ และหน้าแรกของ docs เป็นการ์ด 4 ใบ (Get started, Guides, Reference, Operations)
- ความกว้างเนื้อหาไม่เกิน `--measure`

### `/learn`

- รวมการ์ด 13 ใบเป็นรายการ 3 กลุ่ม (ชื่อกับประโยคเดียว ไม่ใช้การ์ด) และลบ "Three ways to start" ที่ซ้ำกับหน้าแรก

### Studio `/studio/`

- เป็นแอปแยก (`studio/`) เฟสนี้แค่ปรับ header ให้ใช้ลิงก์ชุดเดียวกัน ไม่แตะ layout ภายใน

## 7. หน้าเข้าสู่ระบบ `/login`

**แหล่งอ้างอิง**: ตรวจผ่าน connector 21st.dev ของเจ้าของ (`list_bookmarks` ทุกชนิด, `list_bookmark_lists`, `get_bookmark_list`) เมื่อ 15 ต.ค. 2026 พบ bookmark คอมโพเนนต์ 13 ชิ้น ใน list เดียวชื่อ "List" (13 ชิ้นเดียวกัน) ไม่มี theme หรือ template ที่บันทึกไว้ และ **ไม่มีคอมโพเนนต์ sign-in ใน bookmark เลย** การออกแบบหน้านี้จึงอิงคอมโพเนนต์ sign-in **สาธารณะ** ที่ใกล้เคียงที่สุด (ระบุไว้ชัดว่าไม่ได้มาจาก bookmark) ร่วมกับคอมโพเนนต์ใน bookmark ที่ใช้ประกอบได้ ดูตารางในหัวข้อ 13

| ใช้เป็น | คอมโพเนนต์ (id) | ที่มา | เหตุผล |
|---|---|---|---|
| โครงหลัก | Identifier First Login (37470) | สาธารณะ | ช่องอีเมลช่องเดียวก่อน แล้วค่อยเสนอวิธีที่เหมาะ (รหัสผ่าน หรือ GitHub/Google/Cursor) ตรงกับที่ DevStack มีทั้งบัญชีรหัสผ่านและ OAuth ลดปุ่มที่เห็นพร้อมกัน |
| ความเรียบ | Login (2426) | สาธารณะ | การ์ดเรียบกึ่งกลาง ใกล้สไตล์ nextjs.org ใช้เป็นแนวระยะห่างและขนาดตัวอักษร |
| ไม่เลือก | Split Login (28369) | สาธารณะ | split screen หนักเกินไปบนมือถือ และออกแบบมาสำหรับ GitHub อย่างเดียว |
| แจ้งผล | Dismissible Alert Stack (26527) | bookmark | รูปแบบ alert ตามระดับ (error/warning/info) สำหรับ `auth=invalid|taken|weak|error|missing` |
| ปุ่ม | Button (3507) | bookmark | สถานะ loading/disabled ในปุ่มระหว่างส่งฟอร์ม |
| หลังล็อกอิน | Avatar (34164) | bookmark | รูปโปรไฟล์และ fallback ตัวย่อใน `AccountButton` แทนตัวอักษรย่อของผู้ให้บริการ |

ข้อเสนอ (การ์ดกึ่งกลาง แบบ "Clean & Minimal" / "Centered Social Login"):

0. **ขั้นแรกแบบ identifier-first** (จาก 37470): แสดงช่องอีเมลกับปุ่ม "ดำเนินการต่อ" และปุ่มโลโก้ผู้ให้บริการ 3 ปุ่มด้านล่าง เมื่อกดต่อจึงแสดงช่องรหัสผ่าน (เข้าสู่ระบบ) หรือช่องรหัสผ่านพร้อมยืนยัน (สร้างบัญชี) ฝั่งเซิร์ฟเวอร์ไม่บอกว่าอีเมลนี้มีบัญชีหรือไม่ เพื่อกันการเดาอีเมล ผู้ใช้จึงเลือกแท็บเองตามข้อ 2
1. การ์ดกว้าง 400px กึ่งกลางจอ มีมาสคอตขนาด 40px, หัวข้อ "Sign in to DevStack" และบรรทัดรอง 1 บรรทัด
2. **แท็บ Sign in / Create account** แยกกัน (ตอนนี้เป็นสองปุ่มในฟอร์มเดียว) แท็บ Create account มีช่องยืนยันรหัสผ่านและข้อความเงื่อนไขรหัสผ่านใต้ช่อง ส่วนค่า `action` ยังส่งไป `POST /api/auth/password` ตัวเดิม
3. ช่องอีเมลและรหัสผ่านอยู่บนสุด และมีปุ่มแสดงหรือซ่อนรหัสผ่าน
4. เส้นคั่น "หรือ / or"
5. ปุ่มผู้ให้บริการ 3 ปุ่ม **ใช้โลโก้จริง** (simple-icons มีอยู่แล้วใน `src/components/brand`): GitHub, Google, Cursor บนจอกว้างเรียงแถวเดียว 3 ช่อง บนมือถือเรียงแนวตั้ง
6. ข้อความแจ้งผล (`auth=invalid|taken|weak|error|missing`) แสดงในการ์ดด้านบนฟอร์ม และใช้ `role="alert"` เหมือนเดิม
7. บรรทัดล่าง: ความเป็นส่วนตัวกับลิงก์ docs เป็นตัวเล็ก 1 บรรทัด
8. ไม่ต้องใช้ split screen หรือภาพประกอบใหญ่ เพื่อให้หน้าเบาบนมือถือ

## 8. ข้อความหน้าแรกฉบับใหม่ (ร่าง)

หลักการเขียน: บอกว่า **ได้อะไร** ก่อนบอกว่า **ทำงานอย่างไร** ใช้ชื่อเครื่องมือเท่าที่จำเป็น ไม่เกิน 20 คำต่อย่อหน้า

| คีย์ | English | ไทย |
|---|---|---|
| `hero.badge` | Open source · Free | โอเพนซอร์ส · ใช้ฟรี |
| `hero.title` | Start any project in minutes | เริ่มโปรเจกต์ใหม่ได้ในไม่กี่นาที |
| `hero.subtitle` | Pick a template or describe your app. Get every setup command, in the right order, ready to copy. | เลือกเทมเพลตหรือบอกว่าอยากทำแอปอะไร แล้วรับคำสั่งติดตั้งครบทุกขั้น เรียงถูกลำดับ พร้อมคัดลอก |
| `hero.ctaAgent` | Start building | เริ่มสร้างเลย |
| `hero.ctaTemplates` | Browse templates | ดูเทมเพลต |

**Section 1: สามขั้นตอน · How it works**

| | English | ไทย |
|---|---|---|
| หัวข้อ | Three steps to a running project | สามขั้นตอนถึงโปรเจกต์ที่รันได้ |
| 1 | Choose a template, or ask the AI. | เลือกเทมเพลต หรือถาม AI |
| 2 | Adjust versions and tools. | ปรับเวอร์ชันและเครื่องมือ |
| 3 | Copy the commands or download a script. | คัดลอกคำสั่ง หรือดาวน์โหลดสคริปต์ |

**Section 2: เทมเพลตยอดนิยม · Popular templates**

- EN: "Ready-made stacks for Node.js and Python." / ลิงก์ "See all templates"
- TH: "ชุดเริ่มต้นสำเร็จรูปสำหรับ Node.js และ Python" / ลิงก์ "ดูเทมเพลตทั้งหมด"

**Section 3: ทำไมต้อง DevStack · Why DevStack**

| หัวข้อ EN | เนื้อหา EN | หัวข้อ TH | เนื้อหา TH |
|---|---|---|---|
| Every step explained | Each command says what it does and how to check it worked. | อธิบายทุกขั้น | ทุกคำสั่งบอกว่าทำอะไร และตรวจอย่างไรว่าสำเร็จ |
| AI that plans, not guesses | Describe your app in Thai or English. Works even without an AI key. | AI ช่วยวางแผน | อธิบายแอปเป็นไทยหรืออังกฤษก็ได้ ใช้ได้แม้ไม่มีคีย์ AI |
| Safe by default | We never run your commands. You stay in control. | ปลอดภัยเป็นค่าเริ่มต้น | เราไม่รันคำสั่งของคุณ คุณควบคุมเองทั้งหมด |

**Section 4: CTA ปิดท้าย**

- EN: "Your next project starts here." ปุ่ม "Start building"
- TH: "โปรเจกต์ถัดไปของคุณเริ่มที่นี่" ปุ่ม "เริ่มสร้างเลย"

หมายเหตุ: "Works even without an AI key" หมายถึงตัววางแผนสำรองแบบกฎ (offline planner) เมื่อไม่มีคีย์ AI ฝั่งเซิร์ฟเวอร์ ต้องตรวจถ้อยคำไทยกับเจ้าของ

## 9. กฎสำหรับมือถือ

- ทุกหน้าไม่มีการเลื่อนแนวนอนที่ 320–414px (มี guard `overflow-x-clip` บน body แล้วใน commit `8c0f0eb`)
- จุดแตะอย่างน้อย 44×44px ปุ่มหลักกว้างเต็มจอใน hero และฟอร์ม
- เนื้อความ 16px ขึ้นไป (กันเบราว์เซอร์ iOS ซูมเมื่อโฟกัสช่องกรอก)
- grid 1 คอลัมน์ต่ำกว่า 640px ระยะขอบข้าง 20px
- หน้าแบบแอป (`/chat`, `/builder` ขั้นรีวิว) ใช้ `100dvh` + safe-area และให้แป้นพิมพ์ย่อ layout (`interactive-widget=resizes-content`)
- เป้าหมายความสูงหน้าแรกบน 390px: ไม่เกิน 3,500px (ตอนนี้ 5,451px)

## 10. การเข้าถึง (accessibility)

- คงเงื่อนไขเดิม: contrast AA ทั้งสองธีม (`tests/tokens.test.ts`), ไม่มีอีโมจิใน `src/` และ `L10n` มีครบ `en`/`th`
- ลำดับหัวข้อถูกต้อง: `h1` หนึ่งอันต่อหน้า และ section ใช้ `aria-labelledby`
- แท็บใน `/login` ใช้ Radix Tabs (คีย์บอร์ดลูกศรได้) และ error ผูกกับช่องด้วย `aria-describedby`
- เมนู "More" ใช้ Radix DropdownMenu และ focus กลับไปที่ปุ่มเมื่อปิด
- เคารพ `prefers-reduced-motion` (มาสคอตและซิกเนเจอร์อยู่นิ่ง)
- เพิ่ม test ด้วย axe ใน Playwright ของ `studio/e2e/site.spec.ts` สำหรับหน้าที่ปรับ

## 11. แผนทยอยปล่อย (PR เล็ก)

แต่ละ PR ผ่าน lint, typecheck, test, docs:check และ cf:build มีภาพก่อนและหลังใน `screenshots/v0.9/` และอัปเดต CHANGELOG

| เฟส | PR | ขอบเขต | ต้องขออนุญาต layout |
|---|---|---|---|
| 0 | Tokens | ระยะห่าง, type scale, container, ลด `text-subtle` ในเนื้อความ, หน้า `/design` แสดง scale ใหม่ | ไม่ |
| 1 | Header + footer | ลิงก์หลัก 4 อัน, เมนู More, ปุ่ม Start building, footer แบบลิงก์ ย้ายซิกเนเจอร์ | ใช่ |
| 2 | หน้าแรก + ข้อความ | hero กึ่งกลาง, 5 section + FAQ, ข้อความใหม่ใน `src/lib/i18n.ts`, How It Works Steps (26891), Two-Column FAQ (26910) | ใช่ |
| 3 | `/login` | identifier-first (37470), แท็บ Sign in/Create, โลโก้ผู้ให้บริการ, ยืนยันรหัสผ่าน (API เดิม), Alert Stack (26527) | ใช่ |
| 4 | `/templates` + การ์ด | การ์ดแบบย่อ, ตัวกรอง runtime | ใช่ |
| 5 | `/builder` + `/chat` | Process Timeline (28381) / Progress (3422), drawer current stack, Combobox โมเดล (9020) | ใช่ |
| 6 | `/docs` + `/learn` | sidebar ยุบได้, learn แบบรายการ | ใช่ |

## 12. สิ่งที่จะวัด

- **ความหนาแน่น**: ความสูงหน้าที่ 390px, จำนวนคำใน viewport แรก และจำนวนลิงก์/ปุ่มต่อหน้า (header เป้าหมายไม่เกิน 9 ชิ้น จาก 20) วัดด้วยสคริปต์ Playwright ชุดเดียวกับ audit
- **ความเข้าใจ**: ทดสอบ 5 วินาทีกับผู้ใช้ไทย 5 คน ("เว็บนี้ทำอะไร") ก่อนและหลังเฟส 2
- **การใช้งานจริง** (ถ้าเปิด Cloudflare Web Analytics ได้โดยไม่มีค่าใช้จ่าย): สัดส่วนคนที่กด CTA หลักจากหน้าแรก, สัดส่วนคนที่เริ่ม `/builder` แล้วไปถึงขั้น Export และอัตราสมัครหรือล็อกอินสำเร็จที่ `/login`
- **คุณภาพ**: Lighthouse (Performance, Accessibility ≥ 95) ทั้งมือถือและเดสก์ท็อป และ CLS < 0.05

## 13. คอมโพเนนต์จาก 21st.dev (bookmark ของเจ้าของ)

ข้อมูลจาก connector 21st.dev (metadata เท่านั้น ยังไม่ได้ดึงโค้ด เพราะ `get_component` ใช้โควตาแบบเสียเงิน) ใช้เป็น **แบบอ้างอิง** แล้วสร้างใหม่ด้วย NVX UI (`src/components/ui`, Radix) และ semantic token ไม่ติดตั้ง shadcn registry ทั้งชุด ก่อนนำโค้ดมาใช้ต้องตรวจสัญญาอนุญาตให้ผ่าน AGENTS.md ข้อ 9 (permissive เท่านั้น) และห้ามใช้ `API_KEY_21ST` ใน build

### bookmark ทั้งหมด (13) และหน้าที่ใช้

| คอมโพเนนต์ (id) | ผู้สร้าง | ใช้ที่ | เหตุผล |
|---|---|---|---|
| How It Works Steps (26891) | ln-dev7 | หน้าแรก section "สามขั้นตอน" | วงกลมตัวเลข 3 ขั้น เส้นเชื่อม และปุ่ม CTA กลาง ไม่มีไอคอน ตรงหลัก "ตัวอักษรทำงานแทน" และแทนการ์ด 3 ใบเดิม |
| Two-Column FAQ (26910) | ln-dev7 | หน้าแรก (ก่อน CTA ปิดท้าย) และ `/learn` | คำถามที่พบบ่อยแบบ accordion ฝั่งขวา คำอธิบายฝั่งซ้ายติดอยู่กับที่ ช่วยย้ายข้อความอธิบายยาว ๆ (ความปลอดภัย, โหมดออฟไลน์, ใช้ฟรีไหม) ออกจาก hero และการ์ด |
| Process Timeline (28381) | shadcnui-blocks | `/builder` stepper และหน้า template detail | timeline แนวตั้งที่มีเครื่องหมายถูกสำหรับขั้นที่เสร็จ แทน stepper 4 ช่องแนวนอนที่แน่น และใช้แสดงขั้นตอนของเทมเพลต |
| Progress (3422) | sean0205 | `/builder` (มือถือ) และโควตาใน `/chat` | แถบความคืบหน้าบางแทน stepper บนจอแคบ และแสดงข้อความหรือรูปที่เหลือต่อวันแทนข้อความตัวเล็ก |
| Combobox (9020) | clevision | `/chat` ตัวเลือกโมเดล, ตัวกรอง `/templates` | dropdown ค้นหาได้หนึ่งอัน แทนชิปโมเดล 12 อันและชิปหมวด 10 อัน รองรับตัวเลือกที่ปิดใช้ (โมเดลที่ไม่พร้อม) |
| Combo Kbd (28308) | ai2 | header (ช่องค้นหา `⌘K`), `/chat` hint, `/docs` | ป้ายคีย์ลัดแบบเดียวกันทั้งเว็บ แทน `Kbd` ที่ใช้ปนกันอยู่ |
| Dismissible Alert Stack (26527) | olewandowski1 | `/login`, `/chat` (banner โควตาหรือปิดบริการ), `/builder` | alert ตามระดับที่ปิดได้ แทนกล่องข้อความหลายแบบ |
| Changelog List (28443) | shadcnstore | หน้าใหม่ `/changelog` (ทางเลือก) หรือหัวข้อใน `/learn` | รายการ release พร้อมป้าย Added/Improved/Fixed อ่านจาก CHANGELOG.md เพื่อลดข้อความ "อัปเดตล่าสุด" ที่กระจายอยู่ใน docs (ต้องได้อนุญาต เพราะเป็นหน้าใหม่) |
| Avatar (34164) | appica-dev | `AccountButton` ใน header และเมนูมือถือ | รูปโปรไฟล์ GitHub/Google และ fallback ตัวย่อสำหรับบัญชีรหัสผ่าน |
| Button (3507) | sean0205 | ทุกหน้า (อ้างอิงสถานะ) | สถานะ loading/disabled ที่ชัดเจน เทียบกับ `buttonClasses` เดิม เพิ่มเฉพาะสถานะที่ยังขาด |
| Focus Frame Border (29885) | shadcnspace | hero หน้าแรก (หน้าต่างโค้ด) เท่านั้น | มุมเรืองแสง 4 มุมรอบหน้าต่างโค้ด เป็นจุดเด่นเดียวของหน้า ใช้ที่เดียวเพื่อไม่ให้รก และปิดเมื่อ `prefers-reduced-motion` |
| Experience Timeline (28334) | shadcnui-blocks | ไม่ใช้ตอนนี้ | ออกแบบสำหรับประวัติการทำงาน ไม่มีหน้าที่ตรง อาจใช้กับ `/learn` ส่วนประวัติแพลตฟอร์มภายหลัง |
| Regex Tester (36190) | astralyxdev | ไม่อยู่ในขอบเขต revamp | เป็นเครื่องมือ ไม่ใช่ส่วน UI อาจเป็นไอเดียสำหรับ Studio หรือ MCP tool ภายหลัง |

### ต่อหน้า (สรุป)

- **หน้าแรก**: How It Works Steps (26891), Two-Column FAQ (26910), Focus Frame Border (29885) และ Combo Kbd (28308) ในบรรทัดคำสั่งของ hero
- **Header**: Combo Kbd (28308) ในช่องค้นหา และ Avatar (34164) ในปุ่มบัญชี
- **`/templates`**: Combobox (9020) เป็นตัวกรองหมวด และ Process Timeline (28381) ในหน้า detail
- **`/builder`**: Process Timeline (28381) บนเดสก์ท็อป, Progress (3422) บนมือถือ และ Dismissible Alert Stack (26527)
- **`/chat`**: Combobox (9020) ตัวเลือกโมเดล, Progress (3422) โควตา, Dismissible Alert Stack (26527) และ Combo Kbd (28308)
- **`/login`**: ดูหัวข้อ 7 (Identifier First Login 37470 และ Login 2426 จากคอมโพเนนต์สาธารณะ ส่วน Alert Stack 26527, Button 3507 และ Avatar 34164 จาก bookmark)
- **`/docs`**: Combo Kbd (28308)
- **`/learn`**: Two-Column FAQ (26910) และ Changelog List (28443)

### คอมโพเนนต์สาธารณะที่พิจารณาสำหรับ sign-in (ไม่อยู่ใน bookmark)

ค้นด้วยคำว่า "sign-in" เจอ Auth UI (2624), Identifier First Login (37470), Sign In (2133), Login (2426), Sign In Flo (2553), Split Login (28369), Sign-in (4727), Modern Animated Sign In (2034), Sign In (3197) และ Modern & Stunning sign in (2060) เลือก 37470 กับ 2426 ด้วยเหตุผลในหัวข้อ 7 ส่วนแบบที่มีแอนิเมชันหนัก (2034, 2060, 2553) ขัดกับหลักการเรื่องความเรียบ ถ้าเจ้าของชอบชิ้นอื่น ให้ bookmark ไว้แล้วจะปรับหัวข้อ 7 ตาม

## 14. Phase 2: หน้าแรก (สถานะ)

ทำแล้วและ merge เข้า `main` (PR #13) แล้ว deploy เป็น Worker `56a64535` บน https://devstack.bid (2026-10-15):

- เอาคำสั่งและคำว่า nvm ออกจากหน้าแรกทั้งหมด (โค้ดตัวอย่างใน hero และ `hero.subtitle`) ข้อมูลเทมเพลตที่ใช้ร่วมกัน (ขั้น `node-nvm` ใน composer) และหน้า builder ไม่ได้แก้
- Hero ใช้ข้อความใหม่จากหัวข้อ 8 กรอบมุม Focus Frame (bookmark 29885) ใช้กับหน้าต่างโค้ดใน hero เท่านั้น (`.focus-frame` ใน globals.css และหยุด animation เมื่อผู้ใช้ตั้ง reduced motion)
- มีหัวข้อ "สามขั้นตอน" แบบ How It Works Steps (26891) FAQ สองคอลัมน์ (26910) ใช้ `<details>` แบบ native ตัวอย่างเทมเพลตเหลือ 3 อันพร้อมลิงก์ไป `/templates`
- ตัวอย่างโค้ดสดแบบ react.dev ใช้ Sandpack (`@codesandbox/sandpack-react`, Apache-2.0) อยู่ใน `src/components/home/live-example.tsx` (โหลดแบบ lazy ด้วย `next/dynamic` เมื่อเลื่อนเข้าใกล้หรือกดปุ่ม) และ `live-editor.tsx`
  - **เนื้อหา:** เหมือน sandbox อ้างอิงของเจ้าของ (codesandbox.io/p/sandbox/pvtdl8) คือไฟล์ src/App.tsx ที่เป็น TypeScript, App.js ที่ re-export, index.js และ styles.css (ไฟล์ใน sandbox ไม่ใช่ใน repo นี้ ดู `src/components/home/sandbox-files.ts`) หน้าตัวอย่างแสดง "Welcome to my app" กับปุ่ม "I'm a button" (ตัวอย่าง MyButton จาก Quick Start ของ react.dev) แท็บที่แก้ได้มี App.tsx และ styles.css
  - **ปุ่ม:** มี Reset, Open in CodeSandbox และ refresh ที่หน้าตัวอย่าง
  - **ธีม:** ธีมขาวดำใช้ตัวแปร `--nvx-*` หน้าตัวอย่างตามโหมดสว่างหรือมืดผ่านไฟล์ซ่อน `theme.css` โดยไม่ล้างโค้ดที่ผู้ใช้แก้
  - **มือถือ:** ตัวแก้โค้ดอยู่บน หน้าตัวอย่างอยู่ล่าง
  - **CSP:** `frame-src https://*.codesandbox.io` และ `form-action 'self' https://codesandbox.io` (ดู [api-hardening](../architecture/api-hardening.md)) COEP ยังอยู่ที่ `/studio/*` เท่านั้น
  - **ไลเซนส์:** `@codesandbox/nodebox` ใช้ Sustainable Use License (ไม่ใช่ permissive) เจ้าของอนุมัติให้เป็นข้อยกเว้นของกฎข้อ 9 เมื่อ 2026-10-15 บันทึกไว้ใน `EXCEPTIONS` ของ `scripts/third-party-licenses.mjs` และใน THIRD_PARTY_LICENSES.md

### ช่องวิดีโอ

- **หน้าแรก**: ช่อง `data-slot="howto-video"` ใต้หัวข้อสามขั้นตอน (สัดส่วน 16:9) สำหรับวิดีโอสั้นประมาณ 30 วินาที ตอนนี้ยังเป็นข้อความ "เร็ว ๆ นี้"
- **วิดีโอแบบละเอียด**: จะไปอยู่ใน docs หน้า [เริ่มต้นใช้งาน](../user-guide/getting-started.md) ไม่ใส่บนหน้าแรก
- ไฟล์วิดีโอควรอยู่ใน `public/` ของเราเอง (CSP `media-src 'self'`) ถ้าจะฝังจาก YouTube หรือที่อื่นต้องแก้ `frame-src` และอัปเดต docs นี้กับ api-hardening ก่อน

## 15. แหล่งอ้างอิงดีไซน์จากเจ้าของ (inspiration only)

เจ้าของส่งลิงก์ 21st.dev ต่อไปนี้มาเป็น **แรงบันดาลใจเท่านั้น** เราออกแบบและเขียนโค้ดเองทั้งหมดด้วย NVX UI และ semantic token แบบขาวดำ (phase 0-2) **ไม่ได้คัดลอกโค้ด** ไม่ได้เรียก `get_component` และไม่ได้ติดตั้ง package ของ 21st.dev หรือ shadcn registry จึงไม่มีผลต่อ licence ตาม AGENTS.md ข้อ 9

The owner shared these 21st.dev links as inspiration only. We redesigned everything ourselves with NVX UI and monochrome tokens. No code was copied, `get_component` was not called and nothing was installed.

| Reference (owner link) | What we took as an idea | Our implementation | Used in |
|---|---|---|---|
| Floating Dock by @manuarora700 ([21st.dev](https://21st.dev/community/components?q=Plug-i&preview=%2F%40manuarora700%2Fcomponents%2Ffloating-dock)) | A pill-shaped dock of icons fixed at the bottom of the screen that lifts on hover | `src/components/plugins/category-dock.tsx`: monochrome dock with `bg-bg/70` blur, `border-border`, the active item in `bg-fg text-bg`, a CSS-only lift that is off under reduced motion, real toggle buttons with `aria-pressed` and labels, and horizontal scroll on small screens | `/plugins` category quick-switch (shares state with the filter chips) |
| @nextjsshop library ([21st.dev](https://21st.dev/@nextjsshop/library/nextjsshop)) | A clean card and grid rhythm with simple outline badges | `src/components/plugins/plugin-card.tsx` (outline category badge, mono repo slug, divided action row) | `/plugins`, `/plugins/[name]` |
| Spinners ([21st.dev](https://21st.dev/community/components/s/spinner)) | A choice between a ring and a dots variant | `Spinner` in `src/components/ui/skeleton.tsx` (extended, not duplicated): `variant="ring" \| "dots"`, `size`, `currentColor`, `role=status` when it has a label | Sandpack loading (`home/live-example.tsx`), chat status (`chat/chat-app.tsx`, dots), login submit (`login-form.tsx`), plus the existing Button `loading`, Factory and the sandbox panel |

ก่อนจะนำโค้ดจากลิงก์เหล่านี้มาใช้จริงในอนาคต ต้องตรวจสัญญาอนุญาตและขออนุมัติตามข้อ 9 ก่อน

## 16. Chat streaming และ thought chain (2026-10-15)

**แหล่งอ้างอิง (inspiration only):** [AI chat · thought chain on 21st.dev](https://21st.dev/community/components/s/ai-chat?preview=%2F%40odysseyui%2Fcomponents%2Fcomponents-ai-thought-chain) — ใช้เป็นแนวทางเรื่องลำดับขั้นตอนแนวตั้งและการยุบหลังตอบเสร็จ **ไม่ได้คัดลอกโค้ด** ไม่ได้เรียก `get_component`

**ที่เราทำเอง (monochrome / nextjs.org-like):**

| ไอเดียจาก reference | การ implement ของเรา |
|---|---|
| แถบขั้นตอน / chain เหนือข้อความตอบ | `src/components/chat/thought-chain.tsx` — รายการแนวตั้งเหนือ reply, ไอคอนตาม `ActivityKind`, `Spinner` ตอน `running`, ✓/✗ ตอน `done`/`failed`, ไม่แสดง `reasoning` |
| ข้อความไหลทีละส่วน | `src/components/chat/stream-text.tsx` + `src/lib/chat/stream-buffer.ts` — buffer ด้วย `Intl.Segmenter` (grapheme), ปล่อยด้วย `requestAnimationFrame`, Markdown ผ่าน `markdown-view` ไม่เกิน ~30fps, ตัดที่ fence code ที่ยังไม่ปิด |
| Caret ระหว่างสตรีม | แถบ caret สี `bg-fg` กะพริบ (ปิดเมื่อ `prefers-reduced-motion`) |
| ยุบ chain หลังเสร็จ | `ThoughtChain` ยุบอัตโนมัติ ~600ms หลัง reply ไม่ `pending` และไม่มี step `running` |
| เลื่อนตามข้อความ | `chat-app.tsx` เลื่อนเฉพาะเมื่อผู้ใช้อยู่ใกล้ล่าง; ปุ่ม “Jump to latest” (`chat.jumpToLatest`) |

SSE / รูปแบบ `UiEvent` ฝั่งเซิร์ฟเวอร์ไม่เปลี่ยน

## 17. Customer connections, projects and deploys (PR-A to PR-E)

Pages: `/settings/connections`, `/projects`, `/projects/[id]`, plus the deploy card in chat. Every one uses NVX UI with monochrome tokens: `border-border`, `text-fg`, `text-subtle`, and `bg-fg text-bg` for the strongest state. No colour is used for status; the shape and fill of the pill carry it. No code was copied. These are bookmark references from section 13, used as ideas only:

| Reference | Idea taken | Our implementation |
|---|---|---|
| Process Timeline by shadcnui-blocks (21st.dev id 28381) | A vertical connector line with a dot per step | `src/components/projects/direct-deploy-panel.tsx`: a `border-l` rail with an outlined dot per deployment; `StatusPill` in `src/components/deploy/deploy-status.tsx` uses outline for live, solid fg for failed and a Spinner while running |
| Dismissible Alert Stack by olewandowski1 (id 26527) | Inline, low-noise alerts | Connections and project errors render as a `role="alert"` outline box (`border-fg/40`), not a red banner |
| nextjs.org settings tabs (visual reference) | An underline tab row | `src/components/settings-nav.tsx`: MCP, Connections and Projects tabs with `aria-current` |

Accessibility rules:
- Status regions use `aria-live="polite"`.
- Secret inputs use `type="password"` with `autocomplete="off"` and are cleared after submit.
- Every control has a visible focus ring.
