import type { StackTemplate } from "@/lib/types";
import { mkdirAndCd, pyFreeze, pyVenv } from "../common-steps";

const app = `import numpy as np
import pandas as pd
import plotly.express as px
import streamlit as st

st.set_page_config(page_title="{{name}}", layout="wide")
st.title("{{name}} - data dashboard")

uploaded = st.sidebar.file_uploader("Upload a CSV (optional)", type="csv")
days = st.sidebar.slider("Days of sample data", 7, 90, 30)

if uploaded is not None:
    df = pd.read_csv(uploaded)
    st.subheader("Your data")
    st.dataframe(df)
    numeric = df.select_dtypes("number").columns.tolist()
    if numeric:
        column = st.selectbox("Column to chart", numeric)
        st.plotly_chart(px.histogram(df, x=column))
else:
    rng = np.random.default_rng(42)
    df = pd.DataFrame({
        "day": pd.date_range("2026-01-01", periods=days),
        "signups": rng.integers(20, 120, days),
    })
    df["total"] = df["signups"].cumsum()
    left, right = st.columns(2)
    left.metric("Total signups", int(df["total"].iloc[-1]))
    right.metric("Average per day", round(float(df["signups"].mean()), 1))
    st.plotly_chart(px.line(df, x="day", y="total", title="Cumulative signups"))
    st.dataframe(df)
`;

const template: StackTemplate = {
  id: "streamlit-dashboard",
  name: { en: "Streamlit Data Dashboard", th: "แดชบอร์ดข้อมูลด้วย Streamlit" },
  summary: {
    en: "Pure-Python data app: upload a CSV or explore sample data with Plotly charts and metrics.",
    th: "แอปข้อมูลด้วย Python ล้วน: อัปโหลด CSV หรือดูข้อมูลตัวอย่างพร้อมกราฟ Plotly และตัวชี้วัด",
  },
  category: "data",
  runtimes: ["python"],
  tags: ["Python", "Streamlit", "pandas", "Plotly", "Data"],
  supportedAddons: ["eslint", "testing", "docker", "ci"],
  defaultAddons: [],
  defaultName: "nvx-data",
  keywords: ["streamlit", "data", "csv", "pandas", "data science", "excel", "notebook", "ข้อมูล", "วิทยาศาสตร์ข้อมูล", "ตาราง", "ไฟล์ csv"],
  fileTree: ["{{name}}/", "  .venv/", "  app.py", "  requirements.txt"],
  steps: [
    mkdirAndCd,
    pyVenv,
    {
      id: "streamlit-deps",
      title: { en: "Install Streamlit, pandas and Plotly", th: "ติดตั้ง Streamlit, pandas และ Plotly" },
      explanation: { en: "Streamlit turns Python scripts into web apps; pandas and Plotly handle data and charts.", th: "Streamlit เปลี่ยนสคริปต์ Python เป็นเว็บแอป ส่วน pandas และ Plotly จัดการข้อมูลและกราฟ" },
      commands: ["{{pip}} streamlit pandas plotly"],
      expected: { en: "`streamlit version` prints a version.", th: "`streamlit version` แสดงหมายเลขเวอร์ชัน" },
      verify: "streamlit version",
    },
    pyFreeze,
    {
      id: "streamlit-app",
      title: { en: "Write app.py", th: "เขียน app.py" },
      explanation: { en: "Sidebar controls, metrics, a line chart and a data table — re-runs on every interaction.", th: "มีตัวควบคุมใน sidebar, ตัวชี้วัด, กราฟเส้น และตาราง — รันใหม่ทุกครั้งที่ผู้ใช้โต้ตอบ" },
      commands: [],
      files: [{ path: "app.py", content: app }],
      expected: { en: "app.py exists.", th: "มีไฟล์ app.py" },
      verify: "python -m py_compile app.py",
    },
    {
      id: "dev-server",
      title: { en: "Run the dashboard", th: "รันแดชบอร์ด" },
      explanation: { en: "Starts a local server and opens the browser.", th: "เปิดเซิร์ฟเวอร์ในเครื่องและเปิดเบราว์เซอร์ให้" },
      commands: ["streamlit run app.py"],
      kind: "longRunning",
      expected: { en: "http://localhost:8501 shows the dashboard.", th: "http://localhost:8501 แสดงแดชบอร์ด" },
      verify: "curl -I http://localhost:8501",
    },
  ],
  nextSteps: [
    { en: "Cache expensive loads with @st.cache_data.", th: "ใช้ @st.cache_data แคชการโหลดข้อมูลที่ช้า" },
    { en: "Connect a database with st.connection.", th: "เชื่อมฐานข้อมูลด้วย st.connection" },
    { en: "Deploy free on Streamlit Community Cloud from a GitHub repo.", th: "Deploy ฟรีบน Streamlit Community Cloud จาก GitHub repo" },
  ],
  docs: [
    { label: "Streamlit docs", url: "https://docs.streamlit.io" },
    { label: "Plotly Express", url: "https://plotly.com/python/plotly-express/" },
  ],
  docker: { kind: "python", port: 8501, cmd: ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"] },
  ci: ["python -m py_compile app.py"],
};

export default template;
