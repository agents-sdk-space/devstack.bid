// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  buttonClasses,
  CodeBlock,
  Dialog,
  DialogContent,
  DialogTrigger,
  EmptyState,
  Field,
  Input,
  Segmented,
  Stepper,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToastProvider,
  useToast,
} from "@/components/ui";

describe("Button", () => {
  it("renders a type=button with variant + size classes", () => {
    render(
      <Button variant="danger" size="sm">
        Delete
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.className).toContain("bg-danger");
    expect(btn.className).toContain("h-8");
  });

  it("loading disables the button and sets aria-busy", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveProperty("disabled", true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("asChild renders the child element with button styles", () => {
    render(
      <Button asChild variant="outline">
        <a href="/builder">Open</a>
      </Button>
    );
    const link = screen.getByRole("link", { name: "Open" });
    expect(link.className).toBe(buttonClasses("outline", "md"));
  });
});

describe("Stepper", () => {
  const items = [
    { id: "a", label: "Start" },
    { id: "b", label: "Configure" },
    { id: "c", label: "Export" },
  ];

  it("marks the current step with aria-current=step and announces completion", () => {
    render(<Stepper items={items} current={1} label="Progress" />);
    const nav = screen.getByRole("navigation", { name: "Progress" });
    const current = nav.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain("Configure");
    expect(nav.textContent).toContain("(completed)");
    expect(nav.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });

  it("is clickable when onStepChange is provided", async () => {
    const onStepChange = vi.fn();
    render(<Stepper items={items} current={0} onStepChange={onStepChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    expect(onStepChange).toHaveBeenCalledWith(2);
  });
});

describe("EmptyState", () => {
  it("renders title, description and action; danger tone is an alert", () => {
    render(<EmptyState tone="danger" title="Couldn't plan" description="Rate limited" action={<button>Retry</button>} headingAs="h2" />);
    const alert = screen.getByRole("alert");
    expect(screen.getByRole("heading", { level: 2, name: "Couldn't plan" })).toBeTruthy();
    expect(alert.textContent).toContain("Rate limited");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("neutral tone is not an alert", () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Field", () => {
  it("wires label, hint and error to the control", () => {
    render(
      <Field label="Email" hint="We never share it" error="Invalid email">
        {(p) => <Input {...p} invalid />}
      </Field>
    );
    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby")!.split(" ");
    expect(describedBy).toHaveLength(2);
    expect(describedBy.map((id) => document.getElementById(id)?.textContent)).toEqual(["We never share it", "Invalid email"]);
    expect(screen.getByRole("alert").textContent).toBe("Invalid email");
  });
});

describe("Segmented", () => {
  it("is a labelled radio group that reports changes", async () => {
    function Demo() {
      const [v, setV] = useState<"npm" | "pnpm">("npm");
      return (
        <Segmented
          legend="Package manager"
          value={v}
          onChange={setV}
          options={[
            { value: "npm", label: "npm" },
            { value: "pnpm", label: "pnpm" },
          ]}
        />
      );
    }
    render(<Demo />);
    expect(screen.getByRole("group", { name: "Package manager" })).toBeTruthy();
    const pnpm = screen.getByRole("radio", { name: "pnpm" }) as HTMLInputElement;
    expect(pnpm.checked).toBe(false);
    await userEvent.click(pnpm);
    expect(pnpm.checked).toBe(true);
  });
});

describe("Tabs", () => {
  it("switches panels with the arrow keys", async () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Start">
          <TabsTrigger value="a">Ask AI</TabsTrigger>
          <TabsTrigger value="b">Pick template</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
      </Tabs>
    );
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel A");
    await userEvent.click(screen.getByRole("tab", { name: "Ask AI" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Pick template" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel B");
  });
});

describe("Dialog", () => {
  it("opens from its trigger, is labelled, closes on Escape and returns focus", async () => {
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open menu</Button>
        </DialogTrigger>
        <DialogContent title="Menu" description="Main navigation" closeLabel="Close">
          <p>Navigation links</p>
        </DialogContent>
      </Dialog>
    );
    const trigger = screen.getByRole("button", { name: "Open menu" });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Menu" });
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});

describe("CodeBlock + Toast", () => {
  it("copies the code (without prompt glyphs), flips its label and raises a toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(
      <ToastProvider>
        <CodeBlock code={"npm install\nnpm run dev"} prompt title="bash" toastTitle="Copied to clipboard" copyLabel="Copy" copiedLabel="Copied!" />
      </ToastProvider>
    );
    expect(screen.getByText("bash")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy: bash" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("npm install\nnpm run dev"));
    expect(await screen.findByText("Copied!")).toBeTruthy();
    expect(await screen.findByText("Copied to clipboard")).toBeTruthy();
  });

  it("useToast throws outside the provider", () => {
    function Bad() {
      useToast();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bad />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });

  it("renders toast variants with title and description", async () => {
    function Fire() {
      const toast = useToast();
      return <button onClick={() => toast({ title: "Download started", description: "setup.sh", variant: "success" })}>go</button>;
    }
    render(
      <ToastProvider>
        <Fire />
      </ToastProvider>
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "go" }));
    });
    expect(await screen.findByText("Download started")).toBeTruthy();
    expect(screen.getByText("setup.sh")).toBeTruthy();
  });
});
