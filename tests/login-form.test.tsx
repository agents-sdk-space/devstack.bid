// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginForm, loginFormProblem } from "@/components/login-form";

/**
 * Regression (2026-10-15): "Create a DevStack account" looked dead because the browser's native
 * constraint bubble (minLength 10 / required / type=email) blocked the submit silently on some browsers.
 * The form now validates itself and always shows a visible message.
 */
describe("LoginForm create-account feedback", () => {
  function setup(email: string, password: string) {
    const { container } = render(<LoginForm next="/chat" auth="" provider="" />);
    const form = container.querySelector("form") as HTMLFormElement;
    (container.querySelector('input[name="email"]') as HTMLInputElement).value = email;
    (container.querySelector('input[name="password"]') as HTMLInputElement).value = password;
    const register = container.querySelector('button[value="register"]') as HTMLButtonElement;
    return { form, register };
  }

  it("does not rely on native validation", () => {
    const { form } = setup("", "");
    expect(form.noValidate).toBe(true);
    expect(form.getAttribute("action")).toBe("/api/auth/password");
    expect(form.getAttribute("method")).toBe("post");
  });

  it("shows a visible message for a short password instead of doing nothing", () => {
    const { form, register } = setup("qa@example.test", "short");
    const ev = new Event("submit", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "submitter", { value: register });
    act(() => {
      form.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(screen.getByTestId("login-problem").textContent).toMatch(/10/);
  });

  it("shows a visible message for an invalid email", () => {
    const { form, register } = setup("not-an-email", "Long-enough-pass-1");
    const ev = new Event("submit", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "submitter", { value: register });
    act(() => {
      form.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(screen.getByRole("alert").textContent).toBeTruthy();
  });

  it("lets a valid register submit through to the server (native POST)", () => {
    const { form, register } = setup("qa@example.test", "Long-enough-pass-1");
    const onSubmit = vi.fn();
    const ev = new Event("submit", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "submitter", { value: register });
    form.addEventListener("submit", onSubmit);
    act(() => {
      form.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(false);
    expect(screen.queryByTestId("login-problem")).toBeNull();
    expect(register.getAttribute("aria-disabled")).toBe("true");
  });

  it("mirrors the server rules", () => {
    expect(loginFormProblem("a@b.co", "x".repeat(10))).toBeNull();
    expect(loginFormProblem("a@b.co", "x".repeat(9))?.field).toBe("password");
    expect(loginFormProblem("a@b.co", "x".repeat(201))?.field).toBe("password");
    expect(loginFormProblem("ab.co", "x".repeat(10))?.field).toBe("email");
  });
});

/** Regression (2026-10-22): mobile users saw the 10–200 error with a password they believed was long enough. */
describe("LoginForm password field (fix/password-auth)", () => {
  it("shows a live character count and keeps the value across re-renders", async () => {
    const { fireEvent } = await import("@testing-library/react");
    const { container, rerender } = render(<LoginForm next="/chat" auth="" provider="" />);
    const pw = container.querySelector('input[name="password"]') as HTMLInputElement;
    fireEvent.change(pw, { target: { value: "Pass word!#1" } });
    expect(screen.getByTestId("password-count").textContent).toMatch(/12/);
    rerender(<LoginForm next="/chat" auth="captcha" provider="password" />);
    expect((container.querySelector('input[name="password"]') as HTMLInputElement).value).toBe("Pass word!#1");
    expect(pw.autocapitalize === "none" || pw.getAttribute("autocapitalize") === "none").toBe(true);
  });

  it("accepts symbols, spaces and Thai characters on both client and server", async () => {
    const { acceptPassword } = await import("@/lib/auth/password");
    for (const p of ["P@ss w0rd!#$%", "รหัสผ่านยาวพอแล้ว", "aaaaaaaaaa"]) {
      expect(loginFormProblem("qa@example.test", p)).toBeNull();
      expect(acceptPassword(p)).toBe(p);
    }
    expect(acceptPassword("short")).toBeNull();
  });
});
