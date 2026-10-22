import { useEffect, useState } from "react";

// Inventory admin stored in this browser (localStorage). Swap load/save for your own API when you have one.
const KEY = "__SLUG__:items";
const SEED = [{ id: 1, name: "Widget", stock: 12 }, { id: 2, name: "Gadget", stock: 3 }];

export default function App() {
  const [items, setItems] = useState(() => { try { return JSON.parse(localStorage.getItem(KEY)) ?? SEED; } catch { return SEED; } });
  const [name, setName] = useState("");
  const [stock, setStock] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)); }, [items]);

  function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setItems([...items, { id: Date.now(), name: name.trim(), stock: Number(stock) || 0 }]);
    setName(""); setStock("");
  }
  const shown = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <main>
      <h1>__TITLE__</h1>
      <p>__DESCRIPTION__</p>
      <form onSubmit={add} aria-label="Add item">
        <input aria-label="Name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="Stock" placeholder="Stock" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} />
        <button type="submit">Add</button>
        <input aria-label="Search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <table>
        <thead><tr><th>Name</th><th>Stock</th><th /></tr></thead>
        <tbody>
          {shown.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td>
              <td>{i.stock}{i.stock < 5 ? " (low)" : ""}</td>
              <td><button className="ghost" type="button" onClick={() => setItems(items.filter((x) => x.id !== i.id))}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
