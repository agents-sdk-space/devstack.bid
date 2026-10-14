import type { StackTemplate } from "@/lib/types";
import { mkdirAndCd, pyVenv } from "../common-steps";

const pyproject = `[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "{{name}}"
version = "0.1.0"
description = "A small Python package created with NVX Stack Builder"
readme = "README.md"
requires-python = ">=3.9"
license = "MIT"
authors = [{ name = "Your Name", email = "[email redacted]" }]
dependencies = []
classifiers = [
  "Programming Language :: Python :: 3",
  "Operating System :: OS Independent",
]

[project.scripts]
{{name}} = "{{pkg}}.cli:main"

[tool.hatch.build.targets.wheel]
packages = ["src/{{pkg}}"]
`;

const init = `"""{{name}} - created with NVX Stack Builder."""

__version__ = "0.1.0"


def greet(name: str = "world") -> str:
    return f"Hello, {name}!"
`;

const cli = `import argparse

from . import __version__, greet


def main() -> None:
    parser = argparse.ArgumentParser(prog="{{name}}")
    parser.add_argument("--name", default="world")
    parser.add_argument("--version", action="version", version=__version__)
    args = parser.parse_args()
    print(greet(args.name))


if __name__ == "__main__":
    main()
`;

const template: StackTemplate = {
  id: "pypi-package",
  name: { en: "Python Package for PyPI", th: "แพ็กเกจ Python สำหรับ PyPI" },
  summary: {
    en: "src-layout package with pyproject.toml (hatchling), a console script, `python -m build` and `twine upload` to TestPyPI then PyPI.",
    th: "แพ็กเกจแบบ src-layout ใช้ pyproject.toml (hatchling) มีคำสั่ง console, build ด้วย `python -m build` และอัปโหลดด้วย `twine` ไป TestPyPI แล้วค่อย PyPI",
  },
  category: "package",
  runtimes: ["python"],
  tags: ["Python", "PyPI", "pyproject", "build", "twine"],
  supportedAddons: ["eslint", "testing", "ci"],
  defaultAddons: ["testing"],
  defaultName: "nvx-hello-py",
  keywords: ["pypi", "pip package", "python package", "library", "pyproject", "twine", "publish python", "ไลบรารี", "แพ็กเกจ python"],
  fileTree: ["{{name}}/", "  pyproject.toml", "  README.md", "  src/{{pkg}}/__init__.py", "  src/{{pkg}}/cli.py", "  dist/ (after build)"],
  steps: [
    mkdirAndCd,
    pyVenv,
    {
      id: "pypi-files",
      title: { en: "Create pyproject.toml and the package", th: "สร้าง pyproject.toml และโค้ดแพ็กเกจ" },
      explanation: {
        en: "pyproject.toml holds metadata and the build backend. The src/ layout prevents importing the un-installed folder by accident.",
        th: "pyproject.toml เก็บ metadata และ build backend ส่วน src/ layout ป้องกันการ import โฟลเดอร์ที่ยังไม่ได้ติดตั้งโดยไม่ตั้งใจ",
      },
      commands: [],
      files: [
        { path: "pyproject.toml", content: pyproject },
        { path: "README.md", content: "# {{name}}\n\n    pip install {{name}}\n    {{name}} --name NVX\n" },
        { path: "src/{{pkg}}/__init__.py", content: init },
        { path: "src/{{pkg}}/cli.py", content: cli },
      ],
      expected: { en: "pyproject.toml and src/{{pkg}}/ exist.", th: "มี pyproject.toml และ src/{{pkg}}/" },
    },
    {
      id: "pypi-tools",
      title: { en: "Install build and twine", th: "ติดตั้ง build และ twine" },
      explanation: { en: "build creates the sdist and wheel; twine checks and uploads them.", th: "build สร้าง sdist และ wheel ส่วน twine ตรวจสอบและอัปโหลด" },
      commands: ["{{pip}} --upgrade build twine"],
      expected: { en: "python -m build --version works.", th: "python -m build --version ใช้งานได้" },
      verify: "python -m twine --version",
    },
    {
      id: "pypi-editable",
      title: { en: "Install in editable mode and try it", th: "ติดตั้งแบบ editable แล้วลองใช้" },
      explanation: { en: "-e links the source so code changes apply without reinstalling.", th: "-e ลิงก์ซอร์สโค้ด แก้โค้ดแล้วใช้ได้ทันทีโดยไม่ต้องติดตั้งใหม่" },
      commands: ["{{pip}} -e ."],
      expected: { en: "`{{name}} --name NVX` prints Hello, NVX!", th: "`{{name}} --name NVX` แสดง Hello, NVX!" },
      verify: "{{name}} --name NVX",
    },
    {
      id: "pypi-build",
      title: { en: "Build the distributions", th: "build ไฟล์สำหรับแจกจ่าย" },
      explanation: { en: "Creates dist/*.tar.gz (sdist) and dist/*.whl (wheel), then validates metadata.", th: "สร้าง dist/*.tar.gz (sdist) และ dist/*.whl (wheel) แล้วตรวจ metadata" },
      commands: ["python -m build", "python -m twine check dist/*"],
      expected: { en: "twine check reports PASSED for both files.", th: "twine check แสดง PASSED ทั้งสองไฟล์" },
      verify: "ls dist",
      verifyWindows: "Get-ChildItem dist",
    },
    {
      id: "pypi-testpypi",
      title: { en: "Upload to TestPyPI first", th: "อัปโหลดไป TestPyPI ก่อน" },
      explanation: {
        en: "Create an API token at test.pypi.org. Username is __token__ and the password is the token. Rehearse here before the real index.",
        th: "สร้าง API token ที่ test.pypi.org ใช้ชื่อผู้ใช้ __token__ และรหัสผ่านคือ token ซ้อมที่นี่ก่อนขึ้นของจริง",
      },
      commands: ["python -m twine upload --repository testpypi dist/*"],
      kind: "publish",
      expected: { en: "https://test.pypi.org/project/{{name}}/ exists.", th: "มีหน้า https://test.pypi.org/project/{{name}}/" },
      verify: "python -m pip install --index-url https://test.pypi.org/simple/ --no-deps {{name}}",
    },
    {
      id: "pypi-upload",
      title: { en: "Publish to PyPI", th: "เผยแพร่ขึ้น PyPI" },
      explanation: { en: "Same command without --repository uploads to pypi.org. Versions cannot be re-used — bump version in pyproject.toml for each release.", th: "คำสั่งเดียวกันแต่ไม่มี --repository จะอัปโหลดไป pypi.org เวอร์ชันซ้ำไม่ได้ — เพิ่ม version ใน pyproject.toml ทุกครั้งที่ออกรุ่นใหม่" },
      commands: ["python -m twine upload dist/*"],
      kind: "publish",
      expected: { en: "Anyone can `pip install {{name}}`.", th: "ทุกคน `pip install {{name}}` ได้" },
      verify: "python -m pip index versions {{name}}",
    },
  ],
  nextSteps: [
    { en: "Prefer Trusted Publishing from GitHub Actions instead of long-lived tokens.", th: "แนะนำ Trusted Publishing จาก GitHub Actions แทน token ระยะยาว" },
    { en: "Check the name is free on pypi.org before the first upload.", th: "ตรวจว่าชื่อยังว่างบน pypi.org ก่อนอัปโหลดครั้งแรก" },
  ],
  docs: [
    { label: "Packaging tutorial", url: "https://packaging.python.org/en/latest/tutorials/packaging-projects/" },
    { label: "Trusted Publishing", url: "https://docs.pypi.org/trusted-publishers/" },
  ],
  ci: ["python -m pip install build", "python -m build"],
};

export default template;
