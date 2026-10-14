/** Transactional bilingual messages. No marketing list and no user-supplied HTML. */

export interface OutboundMail {
  to: string;
  from: { email: string; name: string };
  subject: string;
  text: string;
  html: string;
}

export function lifecycleMail(event: "welcome" | "inactive", to: string, from: { email: string; name: string }): OutboundMail {
  if (event === "welcome") {
    return {
      to,
      from,
      subject: "DevStack account is ready / บัญชี DevStack พร้อมแล้ว",
      text: [
        "Your DevStack account is ready.",
        "Sign in at https://devstack.bid to keep your chat history with this account.",
        "",
        "บัญชี DevStack ของคุณพร้อมแล้ว",
        "เข้าสู่ระบบที่ https://devstack.bid เพื่อเก็บประวัติแชตไว้กับบัญชีนี้",
      ].join("\n"),
      html: "<p>Your DevStack account is ready. Sign in at <a href=\"https://devstack.bid\">devstack.bid</a> to keep your chat history with this account.</p><p>บัญชี DevStack ของคุณพร้อมแล้ว เข้าสู่ระบบที่ <a href=\"https://devstack.bid\">devstack.bid</a> เพื่อเก็บประวัติแชตไว้กับบัญชีนี้</p>",
    };
  }
  return {
    to,
    from,
    subject: "Your DevStack workspace is still here / เวิร์กสเปซ DevStack ยังอยู่",
    text: [
      "You have not opened a chat since creating your DevStack account.",
      "Your workspace is still at https://devstack.bid.",
      "",
      "คุณยังไม่ได้เปิดแชตหลังจากสร้างบัญชี DevStack",
      "เวิร์กสเปซยังอยู่ที่ https://devstack.bid",
    ].join("\n"),
    html: "<p>You have not opened a chat since creating your DevStack account. Your workspace is still at <a href=\"https://devstack.bid\">devstack.bid</a>.</p><p>คุณยังไม่ได้เปิดแชตหลังจากสร้างบัญชี DevStack เวิร์กสเปซยังอยู่ที่ <a href=\"https://devstack.bid\">devstack.bid</a></p>",
  };
}
