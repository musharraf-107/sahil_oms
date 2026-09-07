"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";

type Order = {
  id: string;
  order_number: string;
  customer: string;
  phone: string;
  city: string;
  date: string;
  amount: number;
  status: string;
  courier: string;
  awb: string;
  rto_reason: string;
  notes: string;
  payment_status: string;
};

type Remittance = {
  id: string;
  order_id: string | null;
  order_number: string;
  courier: string;
  remittance_date: string;
  gross_amount: number;
  rto_charge: number;
  cod_charge: number;
  other_deductions: number;
  net_amount: number;
  utr_reference: string;
  status: string;
  notes: string;
};

const PAYMENT_STATUSES = ["Pending", "Received", "Remitted"];

const STATUSES = ["New","Processing","Shipped","Out for Delivery","Delivered","RTO Initiated","RTO In-Transit","RTO Delivered","Cancelled"];
const RTO_STATUSES = ["RTO Initiated","RTO In-Transit","RTO Delivered"];
const COURIERS = ["Delhivery","Shiprocket","Own Delivery Team","Bluedart","Xpressbees","Other"];
const CITIES = ["Faridabad","Delhi","Gurugram","Noida","Jaipur","Mumbai","Pune","Bengaluru","Lucknow","Chandigarh"];
const REASONS = ["Customer unavailable","Address incorrect","Refused delivery","Payment issue","Damaged in transit","Not specified"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const fmtMoney = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const genOrderNumber = () => "#SF" + Math.floor(10000 + Math.random() * 89999);
const genAwb = () => "AWB" + Math.floor(100000000 + Math.random() * 899999999);

const emptyOrder = (): Omit<Order, "id"> => ({
  order_number: genOrderNumber(),
  customer: "",
  phone: "",
  city: CITIES[0],
  date: new Date().toISOString().slice(0, 10),
  amount: 0,
  status: "New",
  courier: COURIERS[0],
  awb: genAwb(),
  rto_reason: "",
  notes: "",
  payment_status: "Pending",
});

export default function Dashboard() {
  const supabase = createClient();
  const router = useRouter();

  const [userEmail, setUserEmail] = useState("");
  const [view, setView] = useState<"dashboard" | "orders" | "rto" | "delivery" | "reports" | "import" | "remittance">("dashboard");
  const [orders, setOrders] = useState<Order[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [form, setForm] = useState<Omit<Order, "id">>(emptyOrder());
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [listening, setListening] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [courierFilter, setCourierFilter] = useState("");
  const [exportMonth, setExportMonth] = useState(new Date().getMonth());
  const [exportYear, setExportYear] = useState(new Date().getFullYear());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState(STATUSES[0]);
  const [syncing, setSyncing] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  }, []);

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase.from("orders").select("*").order("date", { ascending: false });
    if (error) {
      showToast("Could not load orders: " + error.message);
    } else {
      setOrders((data as Order[]) || []);
    }
    setLoading(false);
  }, [supabase, showToast]);

  const fetchRemittances = useCallback(async () => {
    const { data, error } = await supabase.from("remittances").select("*").order("remittance_date", { ascending: false });
    if (!error) setRemittances((data as Remittance[]) || []);
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email || ""));
    fetchOrders();
    fetchRemittances();
  }, [fetchOrders, fetchRemittances, supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function saveOrder() {
    if (editing) {
      const { error } = await supabase.from("orders").update(form).eq("id", editing.id);
      if (error) return showToast("Update failed: " + error.message);
      showToast("Order updated");
    } else {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("orders").insert({ ...form, user_id: userData.user?.id });
      if (error) return showToast("Save failed: " + error.message);
      showToast("Order added");
    }
    setModalOpen(false);
    setEditing(null);
    fetchOrders();
  }

  async function deleteOrder(id: string) {
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) return showToast("Delete failed: " + error.message);
    showToast("Order deleted");
    fetchOrders();
  }

  async function updateField(id: string, patch: Partial<Order>) {
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    if (error) return showToast("Update failed: " + error.message);
    fetchOrders();
  }

  async function simulateShopifyOrder() {
    const names = ["Neha Kapoor","Rahul Bhatia","Sanya Malik","Arjun Chawla","Tara Menon","Yash Agarwal"];
    const { data: userData } = await supabase.auth.getUser();
    const payload = {
      order_number: genOrderNumber(),
      customer: names[Math.floor(Math.random() * names.length)],
      phone: "9" + Math.floor(100000000 + Math.random() * 899999999).toString().slice(0, 9),
      city: CITIES[Math.floor(Math.random() * CITIES.length)],
      date: new Date().toISOString(),
      amount: Math.floor(399 + Math.random() * 3500),
      status: "New",
      courier: COURIERS[Math.floor(Math.random() * (COURIERS.length - 1))],
      awb: genAwb(),
      rto_reason: "",
      notes: "Synced from Shopify (simulated)",
      user_id: userData.user?.id,
    };
    const { error } = await supabase.from("orders").insert(payload);
    if (error) return showToast("Failed: " + error.message);
    showToast(`New Shopify order ${payload.order_number} received`);
    fetchOrders();
  }

  async function bulkUpdateStatus() {
    if (selectedIds.size === 0) return;
    const { error } = await supabase.from("orders").update({ status: bulkStatus }).in("id", Array.from(selectedIds));
    if (error) return showToast("Bulk update failed: " + error.message);
    showToast(`Updated ${selectedIds.size} orders to "${bulkStatus}"`);
    setSelectedIds(new Set());
    fetchOrders();
  }

  async function bulkImportRows(rows: Record<string, any>[]) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const findVal = (row: Record<string, any>, keys: string[]) => {
      const entries = Object.entries(row);
      for (const key of keys) {
        const hit = entries.find(([k]) => norm(k).includes(key));
        if (hit && hit[1] !== undefined && hit[1] !== "") return hit[1];
      }
      return undefined;
    };

    let updated = 0, inserted = 0, skipped = 0;
    for (const row of rows) {
      const orderNumber = findVal(row, ["order", "ordno", "ordernumber"]);
      const awb = findVal(row, ["awb", "tracking"]);
      const status = findVal(row, ["status"]);
      const rtoReason = findVal(row, ["reason"]);
      const amount = findVal(row, ["amount", "price"]);
      const customer = findVal(row, ["customer", "name"]);
      const city = findVal(row, ["city"]);
      const phone = findVal(row, ["phone"]);
      const courier = findVal(row, ["courier"]);
      const notes = findVal(row, ["notes", "remark"]);
      const dateVal = findVal(row, ["date"]);

      if (!orderNumber && !awb) { skipped++; continue; }

      const existing = orders.find(
        (o) => (orderNumber && o.order_number?.toLowerCase() === String(orderNumber).toLowerCase()) ||
               (awb && o.awb && o.awb.toLowerCase() === String(awb).toLowerCase())
      );

      const patch: Partial<Order> = {};
      if (status) patch.status = String(status);
      if (rtoReason) patch.rto_reason = String(rtoReason);
      if (awb) patch.awb = String(awb);
      if (courier) patch.courier = String(courier);
      if (notes) patch.notes = String(notes);

      if (existing) {
        if (Object.keys(patch).length === 0) { skipped++; continue; }
        const { error } = await supabase.from("orders").update(patch).eq("id", existing.id);
        if (!error) updated++; else skipped++;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase.from("orders").insert({
          order_number: orderNumber ? String(orderNumber) : genOrderNumber(),
          customer: customer ? String(customer) : "Imported customer",
          phone: phone ? String(phone) : "",
          city: city ? String(city) : "",
          date: dateVal ? new Date(dateVal).toISOString() : new Date().toISOString(),
          amount: amount ? parseFloat(String(amount)) : 0,
          status: status ? String(status) : "New",
          courier: courier ? String(courier) : COURIERS[0],
          awb: awb ? String(awb) : genAwb(),
          rto_reason: rtoReason ? String(rtoReason) : "",
          notes: notes ? String(notes) : "Bulk imported",
          user_id: userData.user?.id,
        });
        if (!error) inserted++; else skipped++;
      }
    }
    showToast(`Import done — ${inserted} added, ${updated} updated, ${skipped} skipped`);
    fetchOrders();
  }

  async function syncFromShopify() {
    setSyncing(true);
    try {
      const res = await fetch("/api/shopify-import", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      showToast(`Synced ${data.imported} orders from Shopify`);
      fetchOrders();
    } catch (e: any) {
      showToast("Shopify sync failed: " + e.message);
    }
    setSyncing(false);
  }

  async function syncCourierTracking() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync-tracking", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      showToast(`Checked ${data.checked} orders — ${data.updated} status updates${data.failed ? `, ${data.failed} failed` : ""}`);
      fetchOrders();
    } catch (e: any) {
      showToast("Courier sync failed: " + e.message);
    }
    setSyncing(false);
  }

  async function saveRemittance(r: Omit<Remittance, "id">, editId?: string) {
    const net = Number(r.gross_amount) - Number(r.rto_charge) - Number(r.cod_charge) - Number(r.other_deductions);
    const payload = { ...r, net_amount: net };
    if (editId) {
      const { error } = await supabase.from("remittances").update(payload).eq("id", editId);
      if (error) return showToast("Update failed: " + error.message);
      showToast("Remittance updated");
    } else {
      const { data: userData } = await supabase.auth.getUser();
      const matchedOrder = orders.find((o) => o.order_number.toLowerCase() === r.order_number.toLowerCase());
      const { error } = await supabase.from("remittances").insert({ ...payload, order_id: matchedOrder?.id || null, user_id: userData.user?.id });
      if (error) return showToast("Save failed: " + error.message);
      showToast("Remittance added");
      if (matchedOrder) updateField(matchedOrder.id, { payment_status: "Remitted" });
    }
    fetchRemittances();
  }

  async function deleteRemittance(id: string) {
    const { error } = await supabase.from("remittances").delete().eq("id", id);
    if (error) return showToast("Delete failed: " + error.message);
    showToast("Remittance deleted");
    fetchRemittances();
  }

  async function bulkImportRemittances(rows: Record<string, any>[]) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const findVal = (row: Record<string, any>, keys: string[]) => {
      const entries = Object.entries(row);
      for (const key of keys) {
        const hit = entries.find(([k]) => norm(k).includes(key));
        if (hit && hit[1] !== undefined && hit[1] !== "") return hit[1];
      }
      return undefined;
    };
    const { data: userData } = await supabase.auth.getUser();
    let added = 0, skipped = 0;
    for (const row of rows) {
      const orderNumber = findVal(row, ["order", "awb", "waybill"]);
      if (!orderNumber) { skipped++; continue; }
      const gross = parseFloat(String(findVal(row, ["grossamount", "codamount", "amount"]) ?? 0)) || 0;
      const rtoCharge = parseFloat(String(findVal(row, ["rtocharge", "returncharge"]) ?? 0)) || 0;
      const codCharge = parseFloat(String(findVal(row, ["codcharge", "codfee"]) ?? 0)) || 0;
      const otherDeductions = parseFloat(String(findVal(row, ["deduction", "penalty", "otherchar"]) ?? 0)) || 0;
      const courier = findVal(row, ["courier"]) || "";
      const utr = findVal(row, ["utr", "reference", "transactionid"]) || "";
      const remitDate = findVal(row, ["remittancedate", "date", "paymentdate"]);
      const matchedOrder = orders.find(
        (o) => o.order_number.toLowerCase() === String(orderNumber).toLowerCase() || o.awb?.toLowerCase() === String(orderNumber).toLowerCase()
      );
      const net = gross - rtoCharge - codCharge - otherDeductions;
      const { error } = await supabase.from("remittances").insert({
        order_id: matchedOrder?.id || null,
        order_number: matchedOrder?.order_number || String(orderNumber),
        courier: courier || matchedOrder?.courier || "",
        remittance_date: remitDate ? new Date(remitDate).toISOString() : new Date().toISOString(),
        gross_amount: gross,
        rto_charge: rtoCharge,
        cod_charge: codCharge,
        other_deductions: otherDeductions,
        net_amount: net,
        utr_reference: String(utr),
        status: "Remitted",
        notes: "Bulk imported",
        user_id: userData.user?.id,
      });
      if (!error) {
        added++;
        if (matchedOrder) updateField(matchedOrder.id, { payment_status: "Remitted" });
      } else skipped++;
    }
    showToast(`Remittance import done — ${added} added, ${skipped} skipped`);
    fetchRemittances();
  }

  // ---- Voice commands (Web Speech API) ----
  function startVoiceCommand() {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Voice commands aren't supported in this browser — try Chrome");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.toLowerCase().trim();
      handleVoiceCommand(transcript);
    };
    recognition.start();
  }

  function handleVoiceCommand(text: string) {
    const has = (...phrases: string[]) => phrases.some((p) => text.includes(p));
    if (has("today")) {
      setView("orders");
      setSearch("");
      const todayStr = new Date().toDateString();
      const todayCount = orders.filter((o) => new Date(o.date).toDateString() === todayStr).length;
      showToast(`Heard: "${text}" — ${todayCount} orders today`);
    } else if (has("dashboard", "home")) {
      setView("dashboard"); showToast(`Heard: "${text}" — opening dashboard`);
    } else if (has("rto", "return")) {
      setView("rto"); showToast(`Heard: "${text}" — opening RTO tracker`);
    } else if (has("delivery", "courier")) {
      setView("delivery"); showToast(`Heard: "${text}" — opening delivery team`);
    } else if (has("remittance", "payment")) {
      setView("remittance"); showToast(`Heard: "${text}" — opening remittance`);
    } else if (has("import", "sync")) {
      setView("import"); showToast(`Heard: "${text}" — opening import & sync`);
    } else if (has("report", "export")) {
      setView("reports"); showToast(`Heard: "${text}" — opening reports`);
    } else if (has("add order", "new order")) {
      setView("orders"); openAdd(); showToast(`Heard: "${text}" — new order form opened`);
    } else if (has("order", "orders")) {
      setView("orders"); showToast(`Heard: "${text}" — opening orders`);
    } else {
      showToast(`Didn't recognize: "${text}"`);
    }
  }


  function openAdd() {
    setEditing(null);
    setForm(emptyOrder());
    setModalOpen(true);
  }
  function openEdit(o: Order) {
    setEditing(o);
    setForm({ ...o, date: new Date(o.date).toISOString().slice(0, 10) });
    setModalOpen(true);
  }

  // ---- derived data ----
  const total = orders.length;
  const delivered = orders.filter((o) => o.status === "Delivered").length;
  const rtoList = useMemo(() => orders.filter((o) => RTO_STATUSES.includes(o.status)), [orders]);
  const pending = orders.filter((o) => ["New", "Processing", "Shipped", "Out for Delivery"].includes(o.status)).length;
  const rtoRate = total ? ((rtoList.length / total) * 100).toFixed(1) : "0.0";
  const revenue = orders.filter((o) => o.status === "Delivered").reduce((s, o) => s + Number(o.amount), 0);
  const recent = [...orders].slice(0, 8);

  const filteredOrders = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter((o) => {
      const matchesQ = !q || o.order_number?.toLowerCase().includes(q) || o.customer?.toLowerCase().includes(q) || o.city?.toLowerCase().includes(q);
      const matchesSt = !statusFilter || o.status === statusFilter;
      const matchesCo = !courierFilter || o.courier === courierFilter;
      return matchesQ && matchesSt && matchesCo;
    });
  }, [orders, search, statusFilter, courierFilter]);

  const years = useMemo(() => {
    const ys = Array.from(new Set(orders.map((o) => new Date(o.date).getFullYear())));
    if (!ys.includes(new Date().getFullYear())) ys.unshift(new Date().getFullYear());
    return ys.sort((a, b) => b - a);
  }, [orders]);

  function toRows(list: Order[]) {
    return list.map((o) => ({
      "Order #": o.order_number,
      Customer: o.customer,
      Phone: o.phone,
      City: o.city,
      Date: fmtDate(o.date),
      "Amount (₹)": o.amount,
      Status: o.status,
      Courier: o.courier,
      "AWB / Tracking": o.awb,
      "RTO Reason": o.rto_reason || "",
      Notes: o.notes || "",
    }));
  }
  function summaryRows(list: Order[], label: string) {
    const d = list.filter((o) => o.status === "Delivered").length;
    const r = list.filter((o) => RTO_STATUSES.includes(o.status)).length;
    const rev = list.filter((o) => o.status === "Delivered").reduce((s, o) => s + Number(o.amount), 0);
    return [
      { Metric: "Period", Value: label },
      { Metric: "Total orders", Value: list.length },
      { Metric: "Delivered", Value: d },
      { Metric: "RTO orders", Value: r },
      { Metric: "RTO rate (%)", Value: list.length ? ((r / list.length) * 100).toFixed(1) : "0.0" },
      { Metric: "Revenue (₹, delivered only)", Value: rev },
    ];
  }

  function exportMonthFile() {
    const list = orders.filter((o) => {
      const d = new Date(o.date);
      return d.getMonth() === exportMonth && d.getFullYear() === exportYear;
    });
    const label = `${MONTHS[exportMonth]} ${exportYear}`;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows(list, label)), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(list)), "Orders");
    XLSX.writeFile(wb, `Orders_${MONTHS[exportMonth]}_${exportYear}.xlsx`);
    showToast(list.length ? `Exported ${list.length} orders for ${label}` : `No orders for ${label} — exported empty template`);
  }
  function exportYearFile(y: number) {
    const yearList = orders.filter((o) => new Date(o.date).getFullYear() === y);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows(yearList, `Year ${y}`)), "Year Overview");
    MONTHS.forEach((m, i) => {
      const list = yearList.filter((o) => new Date(o.date).getMonth() === i);
      if (list.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(list)), m.slice(0, 3) + " " + y);
    });
    XLSX.writeFile(wb, `Orders_Year_${y}.xlsx`);
    showToast(`Exported ${yearList.length} orders across ${y}`);
  }
  function exportAllFile() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows(orders, "All-time")), "Overview");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(orders)), "All Orders");
    XLSX.writeFile(wb, "Orders_AllTime.xlsx");
    showToast(`Exported ${orders.length} orders (all-time)`);
  }

  const navItems = [
    { id: "dashboard", label: "Dashboard" },
    { id: "orders", label: "Orders", count: total },
    { id: "rto", label: "RTO Tracker", count: rtoList.length },
    { id: "remittance", label: "Remittance", count: remittances.length },
    { id: "delivery", label: "Delivery Team" },
    { id: "import", label: "Import & Sync" },
    { id: "reports", label: "Reports & Export" },
  ] as const;

  return (
    <div className="flex min-h-screen bg-ink text-[#E9EEF9] font-body">
      {/* Sidebar */}
      <div className="w-[220px] shrink-0 bg-panel border-r border-bordersoft flex flex-col p-4">
        <div className="flex items-center gap-2.5 px-2 pb-5">
          <div className="w-[30px] h-[30px] rounded-md bg-gradient-to-br from-amber to-[#C97A2B] flex items-center justify-center font-display font-bold text-[#1A1206] text-[15px]">M</div>
          <div>
            <div className="font-display font-semibold text-[16px]">Manifest</div>
            <div className="text-[10px] text-muted2 uppercase tracking-wide">Order &amp; RTO console</div>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 mt-2">
          {navItems.map((item) => (
            <div
              key={item.id}
              onClick={() => setView(item.id)}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13.5px] font-medium cursor-pointer border ${
                view === item.id ? "bg-panel2 border-bordersoft text-[#E9EEF9]" : "border-transparent text-muted hover:bg-panel2 hover:text-[#E9EEF9]"
              }`}
            >
              {item.label}
              {"count" in item && item.count !== undefined && (
                <span className="ml-auto font-mono text-[10.5px] text-muted2 bg-white/5 px-1.5 py-0.5 rounded-full">{item.count}</span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-auto pt-3.5 border-t border-bordersoft text-[11px] text-muted2 truncate">
          <button
            onClick={startVoiceCommand}
            className={`w-full flex items-center justify-center gap-2 mb-3 px-2.5 py-2 rounded-md text-[12.5px] font-medium border ${
              listening ? "bg-red/10 border-red text-red" : "bg-panel2 border-bordersoft text-muted"
            }`}
          >
            {listening ? "● Listening…" : "🎙 Voice command"}
          </button>
          {userEmail || "…"}
          <button onClick={handleSignOut} className="block mt-2 text-[11px] text-red hover:underline">
            Sign out
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 min-w-0 p-6 md:p-8 pb-16">
        {loading ? (
          <div className="text-muted text-sm">Loading orders…</div>
        ) : (
          <>
            {view === "dashboard" && (
              <>
                <TopBar
                  title="Dashboard"
                  sub="Live snapshot of orders synced from your Shopify store"
                  onSimulate={simulateShopifyOrder}
                  onAdd={openAdd}
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <Kpi label="Total orders" value={String(total)} sub="All-time, from panel records" />
                  <Kpi label="Pending / in transit" value={String(pending)} sub="New, processing, shipped, OFD" color="amber" />
                  <Kpi label="Delivered" value={String(delivered)} sub={`${fmtMoney(revenue)} realised revenue`} color="teal" />
                  <Kpi label="RTO rate" value={`${rtoRate}%`} sub={`${rtoList.length} orders returned to origin`} color="red" />
                </div>
                <Panel title="Recent orders">
                  {recent.length ? (
                    <OrdersTable list={recent} onEdit={openEdit} onDelete={deleteOrder} onStatus={(id, s) => updateField(id, { status: s })} showActions={false} onViewDetail={setViewingOrder} />
                  ) : (
                    <Empty title="No orders yet" sub="Simulate a Shopify order or add one manually to get started." onAdd={openAdd} />
                  )}
                </Panel>
              </>
            )}

            {view === "orders" && (
              <>
                <TopBar title="Orders" sub="Every order captured in the panel — search, filter, update status" onSimulate={simulateShopifyOrder} onAdd={openAdd} />
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2.5 bg-panel2 border border-border rounded-lg px-4 py-2.5 mb-3">
                    <span className="text-[12.5px] text-muted">{selectedIds.size} selected</span>
                    <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="bg-ink border border-bordersoft rounded-md px-2.5 py-1.5 text-[12.5px]">
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <button onClick={bulkUpdateStatus} className="px-3 py-1.5 rounded-md bg-amber text-[#1A1206] text-[12.5px] font-semibold">Apply to selected</button>
                    <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 rounded-md border border-bordersoft text-muted text-[12.5px]">Clear</button>
                  </div>
                )}
                <div className="bg-panel border border-bordersoft rounded-xl overflow-hidden">
                  <div className="flex gap-2 p-3 border-b border-bordersoft flex-wrap">
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order #, customer, city…" className="bg-ink border border-bordersoft rounded-md px-2.5 py-1.5 text-[12.5px] min-w-[220px]" />
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-ink border border-bordersoft rounded-md px-2.5 py-1.5 text-[12.5px]">
                      <option value="">All statuses</option>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <select value={courierFilter} onChange={(e) => setCourierFilter(e.target.value)} className="bg-ink border border-bordersoft rounded-md px-2.5 py-1.5 text-[12.5px]">
                      <option value="">All couriers</option>
                      {COURIERS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  {filteredOrders.length ? (
                    <OrdersTable
                      list={filteredOrders}
                      onEdit={openEdit}
                      onDelete={deleteOrder}
                      onStatus={(id, s) => updateField(id, { status: s })}
                      showActions
                      selectedIds={selectedIds}
                      onToggle={(id) => setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
                      onToggleAll={() => setSelectedIds((prev) => prev.size === filteredOrders.length ? new Set() : new Set(filteredOrders.map((o) => o.id)))}
                      onViewDetail={setViewingOrder}
                    />
                  ) : (
                    <Empty title="No matching orders" sub="Try adjusting your search or filters." onAdd={openAdd} />
                  )}
                </div>
              </>
            )}

            {view === "rto" && (
              <RtoView
                rtoList={rtoList}
                total={total}
                onStatus={(id, s) => updateField(id, { status: s })}
                onReason={(id, r) => updateField(id, { rto_reason: r })}
              />
            )}

            {view === "delivery" && <DeliveryView orders={orders} />}

            {view === "remittance" && (
              <RemittanceView
                remittances={remittances}
                orders={orders}
                onSave={saveRemittance}
                onDelete={deleteRemittance}
                onImportRows={bulkImportRemittances}
              />
            )}

            {view === "import" && (
              <ImportView onImportRows={bulkImportRows} onSyncShopify={syncFromShopify} onSyncTracking={syncCourierTracking} syncing={syncing} />
            )}

            {view === "reports" && (
              <ReportsView
                years={years}
                exportMonth={exportMonth}
                setExportMonth={setExportMonth}
                exportYear={exportYear}
                setExportYear={setExportYear}
                onExportMonth={exportMonthFile}
                onExportYear={exportYearFile}
                onExportAll={exportAllFile}
                orders={orders}
              />
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-5" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="bg-panel border border-border rounded-xl w-full max-w-lg max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-bordersoft">
              <div className="font-display font-semibold text-[16px]">{editing ? "Edit order" : "New order"}</div>
              <button onClick={() => setModalOpen(false)} className="text-muted text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <Field label="Order number"><input className="f-input" value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value })} /></Field>
              <Field label="Date"><input type="date" className="f-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              <Field label="Customer name"><input className="f-input" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} /></Field>
              <Field label="Phone"><input className="f-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="City"><input className="f-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
              <Field label="Amount (₹)"><input type="number" className="f-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} /></Field>
              <Field label="Status">
                <select className="f-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Courier">
                <select className="f-input" value={form.courier} onChange={(e) => setForm({ ...form, courier: e.target.value })}>
                  {COURIERS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="AWB / Tracking ID"><input className="f-input" value={form.awb} onChange={(e) => setForm({ ...form, awb: e.target.value })} /></Field>
              <Field label="Payment status">
                <select className="f-input" value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value })}>
                  {PAYMENT_STATUSES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="RTO reason (if applicable)"><input className="f-input" value={form.rto_reason} onChange={(e) => setForm({ ...form, rto_reason: e.target.value })} /></Field>
              <div className="col-span-2"><Field label="Notes"><input className="f-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-bordersoft">
              <button onClick={() => setModalOpen(false)} className="px-3.5 py-2 rounded-md border border-bordersoft text-muted text-[13px]">Cancel</button>
              <button onClick={saveOrder} className="px-3.5 py-2 rounded-md bg-amber text-[#1A1206] font-semibold text-[13px]">Save order</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-panel2 border border-border rounded-lg px-4 py-2.5 text-[13px] z-[100] flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-teal" /> {toast}
        </div>
      )}

      {viewingOrder && (
        <OrderDetailModal
          order={viewingOrder}
          remittance={remittances.find((r) => r.order_id === viewingOrder.id || r.order_number.toLowerCase() === viewingOrder.order_number.toLowerCase())}
          onClose={() => setViewingOrder(null)}
          onEdit={() => { openEdit(viewingOrder); setViewingOrder(null); }}
        />
      )}

      <style jsx global>{`
        .f-input { width: 100%; background: #0E1626; border: 1px solid #1E2C4A; color: #E9EEF9; border-radius: 7px; padding: 9px 10px; font-size: 13px; }
        .f-input:focus { outline: none; border-color: #F0A94E; }
      `}</style>
    </div>
  );
}

/* ---------------- Small components ---------------- */

function OrderDetailModal({ order, remittance, onClose, onEdit }: { order: Order; remittance?: Remittance; onClose: () => void; onEdit: () => void }) {
  const paymentColor = order.payment_status === "Remitted" ? "text-teal" : order.payment_status === "Received" ? "text-amber" : "text-muted";
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-5" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-panel border border-border rounded-xl w-full max-w-lg max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-bordersoft">
          <div>
            <div className="font-display font-semibold text-[16px]">{order.order_number}</div>
            <div className="text-[11.5px] text-muted mt-0.5">Placed {fmtDate(order.date)}</div>
          </div>
          <button onClick={onClose} className="text-muted text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusStamp status={order.status} />
            <span className={`text-[11px] font-mono font-semibold uppercase tracking-wide ${paymentColor}`}>Payment: {order.payment_status}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div><div className="text-muted2 text-[11px] uppercase tracking-wide mb-1">Customer</div>{order.customer}</div>
            <div><div className="text-muted2 text-[11px] uppercase tracking-wide mb-1">Phone</div>{order.phone || "—"}</div>
            <div><div className="text-muted2 text-[11px] uppercase tracking-wide mb-1">City</div>{order.city || "—"}</div>
            <div><div className="text-muted2 text-[11px] uppercase tracking-wide mb-1">Amount</div>{fmtMoney(order.amount)}</div>
            <div><div className="text-muted2 text-[11px] uppercase tracking-wide mb-1">Courier</div>{order.courier}</div>
            <div><div className="text-muted2 text-[11px] uppercase tracking-wide mb-1">AWB / Tracking</div><span className="font-mono">{order.awb || "—"}</span></div>
            {order.rto_reason && <div className="col-span-2"><div className="text-muted2 text-[11px] uppercase tracking-wide mb-1">RTO reason</div>{order.rto_reason}</div>}
            {order.notes && <div className="col-span-2"><div className="text-muted2 text-[11px] uppercase tracking-wide mb-1">Notes</div>{order.notes}</div>}
          </div>

          <div className="border-t border-bordersoft pt-4">
            <div className="text-muted2 text-[11px] uppercase tracking-wide mb-2 font-semibold">Remittance</div>
            {remittance ? (
              <div className="grid grid-cols-2 gap-3 text-[13px] bg-panel2 rounded-lg p-3">
                <div><div className="text-muted2 text-[11px] mb-1">Gross</div>{fmtMoney(remittance.gross_amount)}</div>
                <div><div className="text-muted2 text-[11px] mb-1">RTO charge</div><span className="text-red">-{fmtMoney(remittance.rto_charge)}</span></div>
                <div><div className="text-muted2 text-[11px] mb-1">COD charge</div><span className="text-red">-{fmtMoney(remittance.cod_charge)}</span></div>
                <div><div className="text-muted2 text-[11px] mb-1">Other deductions</div><span className="text-red">-{fmtMoney(remittance.other_deductions)}</span></div>
                <div className="col-span-2 border-t border-bordersoft pt-2 mt-1"><div className="text-muted2 text-[11px] mb-1">Net remitted</div><span className="text-teal font-semibold">{fmtMoney(remittance.net_amount)}</span></div>
                {remittance.utr_reference && <div className="col-span-2 font-mono text-[11.5px] text-muted">UTR: {remittance.utr_reference}</div>}
              </div>
            ) : (
              <div className="text-[12.5px] text-muted">No remittance recorded yet for this order.</div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-bordersoft">
          <button onClick={onClose} className="px-3.5 py-2 rounded-md border border-bordersoft text-muted text-[13px]">Close</button>
          <button onClick={onEdit} className="px-3.5 py-2 rounded-md bg-amber text-[#1A1206] font-semibold text-[13px]">Edit order</button>
        </div>
      </div>
    </div>
  );
}

function TopBar({ title, sub, onSimulate, onAdd }: { title: string; sub: string; onSimulate: () => void; onAdd: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
      <div>
        <div className="font-display text-[22px] font-semibold">{title}</div>
        <div className="text-muted text-[13px] mt-1">{sub}</div>
      </div>
      <div className="flex gap-2">
        <button onClick={onSimulate} className="px-3.5 py-2 rounded-md border border-bordersoft bg-panel2 text-[13px] font-medium">⇅ Simulate Shopify order</button>
        <button onClick={onAdd} className="px-3.5 py-2 rounded-md bg-amber text-[#1A1206] text-[13px] font-semibold">+ Add order</button>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub: string; color?: "amber" | "teal" | "red" }) {
  const colorClass = color === "amber" ? "text-amber" : color === "teal" ? "text-teal" : color === "red" ? "text-red" : "text-[#E9EEF9]";
  return (
    <div className="bg-panel border border-bordersoft rounded-[10px] p-4">
      <div className="text-[11px] text-muted2 uppercase tracking-wide font-semibold">{label}</div>
      <div className={`font-display text-[26px] font-bold mt-2 ${colorClass}`}>{value}</div>
      <div className="text-[11.5px] text-muted mt-1.5">{sub}</div>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-panel border border-bordersoft rounded-[10px] overflow-hidden mb-5">
      <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-bordersoft flex-wrap gap-2.5">
        <div className="font-display font-semibold text-[14.5px]">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Empty({ title, sub, onAdd }: { title: string; sub: string; onAdd: () => void }) {
  return (
    <div className="py-12 px-5 text-center text-muted">
      <div className="font-display text-[15px] text-[#E9EEF9] mb-1.5">{title}</div>
      <div className="text-[12.5px] mb-4">{sub}</div>
      <button onClick={onAdd} className="px-3.5 py-2 rounded-md bg-amber text-[#1A1206] text-[13px] font-semibold">+ Add your first order</button>
    </div>
  );
}

function StatusStamp({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    new: "text-indigo", processing: "text-muted", shipped: "text-amber", outfordelivery: "text-amber",
    delivered: "text-teal", rtoinitiated: "text-red", rtointransit: "text-red", rtodelivered: "text-[#C77BF0]", cancelled: "text-muted2",
  };
  return <span className={`stamp ${colorMap[slug(status)] || "text-muted"}`}>{status}</span>;
}

function OrdersTable({
  list, onEdit, onDelete, onStatus, showActions, selectedIds, onToggle, onToggleAll, onViewDetail,
}: {
  list: Order[]; onEdit: (o: Order) => void; onDelete: (id: string) => void; onStatus: (id: string, s: string) => void; showActions: boolean;
  selectedIds?: Set<string>; onToggle?: (id: string) => void; onToggleAll?: () => void; onViewDetail?: (o: Order) => void;
}) {
  const selectable = !!selectedIds && !!onToggle;
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          {selectable && (
            <th className="px-4 py-2.5 border-b border-bordersoft">
              <input type="checkbox" checked={selectedIds!.size > 0 && selectedIds!.size === list.length} onChange={onToggleAll} />
            </th>
          )}
          {["Order", "Customer", "Date", "Amount", "Courier", "Status", showActions ? "" : null].filter((x) => x !== null).map((h, i) => (
            <th key={i} className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-wide text-muted2 font-semibold border-b border-bordersoft whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {list.map((o) => (
          <tr key={o.id} className="hover:bg-white/[0.015]">
            {selectable && (
              <td className="px-4 py-2.5 border-b border-bordersoft">
                <input type="checkbox" checked={selectedIds!.has(o.id)} onChange={() => onToggle!(o.id)} />
              </td>
            )}
            <td className="px-4 py-2.5 border-b border-bordersoft font-mono text-[12.5px]">
              {onViewDetail ? (
                <button onClick={() => onViewDetail(o)} className="underline decoration-dotted hover:text-amber">{o.order_number}</button>
              ) : o.order_number}
            </td>
            <td className="px-4 py-2.5 border-b border-bordersoft">
              <div className="font-medium">{o.customer}</div>
              <div className="text-muted text-[12px]">{o.city}</div>
            </td>
            <td className="px-4 py-2.5 border-b border-bordersoft font-mono text-[12px] text-muted">{fmtDate(o.date)}</td>
            <td className="px-4 py-2.5 border-b border-bordersoft font-mono">{fmtMoney(o.amount)}</td>
            <td className="px-4 py-2.5 border-b border-bordersoft"><span className="text-[11.5px] text-muted bg-panel2 px-2 py-0.5 rounded-full border border-bordersoft whitespace-nowrap">{o.courier}</span></td>
            <td className="px-4 py-2.5 border-b border-bordersoft">
              <select value={o.status} onChange={(e) => onStatus(o.id, e.target.value)} className="bg-panel2 border border-bordersoft rounded-md px-1.5 py-1 text-[12px]">
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </td>
            {showActions && (
              <td className="px-4 py-2.5 border-b border-bordersoft text-right whitespace-nowrap">
                <button onClick={() => onEdit(o)} className="text-[12px] px-2.5 py-1 rounded-md border border-bordersoft text-muted mr-1.5">Edit</button>
                <button onClick={() => onDelete(o.id)} className="text-[12px] px-2.5 py-1 rounded-md border border-red text-red">Delete</button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <div className="w-[120px] shrink-0 text-[12px] text-muted">{label}</div>
      <div className="flex-1 h-2 bg-panel2 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-9 text-right font-mono text-[11.5px] text-muted">{value}</div>
    </div>
  );
}

function RtoView({ rtoList, total, onStatus, onReason }: { rtoList: Order[]; total: number; onStatus: (id: string, s: string) => void; onReason: (id: string, r: string) => void }) {
  const rtoRate = total ? ((rtoList.length / total) * 100).toFixed(1) : "0.0";
  const byReason: Record<string, number> = {};
  rtoList.forEach((o) => { const r = o.rto_reason || "Not specified"; byReason[r] = (byReason[r] || 0) + 1; });
  const topReason = Object.entries(byReason).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

  return (
    <>
      <div className="mb-5">
        <div className="font-display text-[22px] font-semibold">RTO Tracker</div>
        <div className="text-muted text-[13px] mt-1">Orders returned to origin — monitor causes and courier accountability</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Kpi label="RTO orders" value={String(rtoList.length)} sub={`out of ${total} total orders`} color="red" />
        <Kpi label="RTO rate" value={`${rtoRate}%`} sub="across all-time data" color="red" />
        <Kpi label="Top reason" value={topReason} sub="most common cause" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4">
        <div className="bg-panel border border-bordersoft rounded-[10px] overflow-hidden">
          <div className="px-[18px] py-3.5 border-b border-bordersoft font-display font-semibold text-[14.5px]">RTO orders</div>
          {rtoList.length === 0 ? (
            <div className="py-12 text-center text-muted text-[12.5px]">Everything is moving smoothly — flagged returns will show up here.</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr>{["Order", "Customer", "AWB", "Status", "Reason"].map((h) => <th key={h} className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-wide text-muted2 font-semibold border-b border-bordersoft">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rtoList.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5 border-b border-bordersoft font-mono text-[12.5px]">{o.order_number}</td>
                    <td className="px-4 py-2.5 border-b border-bordersoft">{o.customer}</td>
                    <td className="px-4 py-2.5 border-b border-bordersoft font-mono text-[12px] text-muted">{o.awb}</td>
                    <td className="px-4 py-2.5 border-b border-bordersoft">
                      <select value={o.status} onChange={(e) => onStatus(o.id, e.target.value)} className="bg-panel2 border border-bordersoft rounded-md px-1.5 py-1 text-[12px]">
                        {[...RTO_STATUSES, "Delivered"].map((s) => <option key={s}>{s === "Delivered" ? "Mark redelivered" : s}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 border-b border-bordersoft">
                      <select value={o.rto_reason} onChange={(e) => onReason(o.id, e.target.value)} className="bg-panel2 border border-bordersoft rounded-md px-1.5 py-1 text-[12px]">
                        {REASONS.map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="bg-panel border border-bordersoft rounded-[10px] p-[18px]">
          <div className="font-display font-semibold text-[14.5px] mb-3.5">RTO reasons breakdown</div>
          {Object.entries(byReason).length ? Object.entries(byReason).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
            <Bar key={reason} label={reason} value={count} total={rtoList.length} color="#EF6259" />
          )) : <div className="text-muted text-[12.5px]">No RTO orders to break down yet.</div>}
        </div>
      </div>
    </>
  );
}

function DeliveryView({ orders }: { orders: Order[] }) {
  const groups = COURIERS.map((c) => ({ courier: c, list: orders.filter((o) => o.courier === c) })).filter((g) => g.list.length > 0);
  return (
    <>
      <div className="mb-5">
        <div className="font-display text-[22px] font-semibold">Delivery Team</div>
        <div className="text-muted text-[13px] mt-1">Performance across your own fleet and courier partners</div>
      </div>
      {groups.length === 0 ? (
        <div className="bg-panel border border-bordersoft rounded-[10px] py-12 text-center text-muted text-[12.5px]">Add orders and assign a courier to see performance here.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(({ courier, list }) => {
            const d = list.filter((o) => o.status === "Delivered").length;
            const rto = list.filter((o) => RTO_STATUSES.includes(o.status)).length;
            const active = list.filter((o) => ["New", "Processing", "Shipped", "Out for Delivery"].includes(o.status)).length;
            const successRate = list.length ? Math.round((d / list.length) * 100) : 0;
            return (
              <div key={courier} className="bg-panel border border-bordersoft rounded-[10px] p-[18px]">
                <div className="flex items-center justify-between mb-3.5">
                  <div>
                    <div className="font-display font-semibold text-[14.5px]">{courier}</div>
                    <div className="text-[11.5px] text-muted2 mt-0.5">{courier === "Own Delivery Team" ? "In-house fleet" : "Third-party courier partner"}</div>
                  </div>
                  <span className="text-[11.5px] text-muted bg-panel2 px-2 py-0.5 rounded-full border border-bordersoft">{list.length} orders</span>
                </div>
                <Bar label="Delivered" value={d} total={list.length} color="#3FD6BE" />
                <Bar label="In transit" value={active} total={list.length} color="#F0A94E" />
                <Bar label="RTO" value={rto} total={list.length} color="#EF6259" />
                <div className="mt-2.5 text-[11.5px] text-muted">Success rate: <strong className="text-[#E9EEF9]">{successRate}%</strong></div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ReportsView({
  years, exportMonth, setExportMonth, exportYear, setExportYear, onExportMonth, onExportYear, onExportAll, orders,
}: {
  years: number[]; exportMonth: number; setExportMonth: (n: number) => void; exportYear: number; setExportYear: (n: number) => void;
  onExportMonth: () => void; onExportYear: (y: number) => void; onExportAll: () => void; orders: Order[];
}) {
  const [yearOnly, setYearOnly] = useState(years[0] || new Date().getFullYear());
  return (
    <>
      <div className="mb-5">
        <div className="font-display text-[22px] font-semibold">Reports &amp; Export</div>
        <div className="text-muted text-[13px] mt-1">Download order data as Excel — month-wise or full year, saved for year-round records</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="bg-panel border border-bordersoft rounded-[10px] p-[18px]">
          <div className="font-display font-semibold text-[14.5px] mb-3.5">Export month-wise</div>
          <div className="flex gap-2 flex-wrap mb-2.5">
            <select value={exportMonth} onChange={(e) => setExportMonth(parseInt(e.target.value))} className="bg-ink border border-bordersoft rounded-md px-2.5 py-1.5 text-[12.5px]">
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select value={exportYear} onChange={(e) => setExportYear(parseInt(e.target.value))} className="bg-ink border border-bordersoft rounded-md px-2.5 py-1.5 text-[12.5px]">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={onExportMonth} className="px-3.5 py-2 rounded-md bg-amber text-[#1A1206] text-[13px] font-semibold">⇩ Export month (.xlsx)</button>
          </div>
          <div className="text-[12px] text-muted">Includes every order placed in the selected month, with a summary sheet.</div>
        </div>
        <div className="bg-panel border border-bordersoft rounded-[10px] p-[18px]">
          <div className="font-display font-semibold text-[14.5px] mb-3.5">Export full year</div>
          <div className="flex gap-2 flex-wrap mb-2.5">
            <select value={yearOnly} onChange={(e) => setYearOnly(parseInt(e.target.value))} className="bg-ink border border-bordersoft rounded-md px-2.5 py-1.5 text-[12.5px]">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={() => onExportYear(yearOnly)} className="px-3.5 py-2 rounded-md bg-amber text-[#1A1206] text-[13px] font-semibold">⇩ Export year (.xlsx)</button>
          </div>
          <div className="text-[12px] text-muted">One workbook, every month as its own sheet, plus a yearly overview.</div>
        </div>
      </div>
      <div className="bg-panel border border-bordersoft rounded-[10px] overflow-hidden mb-5">
        <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-bordersoft">
          <div className="font-display font-semibold text-[14.5px]">Yearly overview</div>
          <button onClick={onExportAll} className="text-[12px] px-2.5 py-1.5 rounded-md border border-bordersoft text-muted">⇩ Export all-time (.xlsx)</button>
        </div>
        <table className="w-full text-[13px]">
          <thead><tr>{["Year", "Orders", "Delivered", "RTO", "Revenue"].map((h) => <th key={h} className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-wide text-muted2 font-semibold border-b border-bordersoft">{h}</th>)}</tr></thead>
          <tbody>
            {years.map((y) => {
              const list = orders.filter((o) => new Date(o.date).getFullYear() === y);
              const d = list.filter((o) => o.status === "Delivered").length;
              const r = list.filter((o) => RTO_STATUSES.includes(o.status)).length;
              const rev = list.filter((o) => o.status === "Delivered").reduce((s, o) => s + Number(o.amount), 0);
              return (
                <tr key={y}>
                  <td className="px-4 py-2.5 border-b border-bordersoft font-mono">{y}</td>
                  <td className="px-4 py-2.5 border-b border-bordersoft">{list.length}</td>
                  <td className="px-4 py-2.5 border-b border-bordersoft">{d}</td>
                  <td className="px-4 py-2.5 border-b border-bordersoft">{r}</td>
                  <td className="px-4 py-2.5 border-b border-bordersoft font-mono">{fmtMoney(rev)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RemittanceView({
  remittances, orders, onSave, onDelete, onImportRows,
}: {
  remittances: Remittance[]; orders: Order[];
  onSave: (r: Omit<Remittance, "id">, editId?: string) => void;
  onDelete: (id: string) => void;
  onImportRows: (rows: Record<string, any>[]) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [form, setForm] = useState({
    order_number: "", courier: COURIERS[0], remittance_date: new Date().toISOString().slice(0, 10),
    gross_amount: 0, rto_charge: 0, cod_charge: 0, other_deductions: 0, utr_reference: "", status: "Remitted", notes: "",
  });
  const [preview, setPreview] = useState<Record<string, any>[]>([]);
  const [fileName, setFileName] = useState("");

  const totalNet = remittances.reduce((s, r) => s + Number(r.net_amount), 0);
  const totalRto = remittances.reduce((s, r) => s + Number(r.rto_charge), 0);
  const totalDeductions = remittances.reduce((s, r) => s + Number(r.rto_charge) + Number(r.cod_charge) + Number(r.other_deductions), 0);
  const remittedOrderNumbers = new Set(remittances.map((r) => r.order_number.toLowerCase()));
  const awaitingRemittance = orders.filter((o) => o.status === "Delivered" && !remittedOrderNumbers.has(o.order_number.toLowerCase()));

  function openNew() {
    setEditId(undefined);
    setForm({ order_number: "", courier: COURIERS[0], remittance_date: new Date().toISOString().slice(0, 10), gross_amount: 0, rto_charge: 0, cod_charge: 0, other_deductions: 0, utr_reference: "", status: "Remitted", notes: "" });
    setFormOpen(true);
  }
  function openEditR(r: Remittance) {
    setEditId(r.id);
    setForm({ order_number: r.order_number, courier: r.courier, remittance_date: new Date(r.remittance_date).toISOString().slice(0, 10), gross_amount: r.gross_amount, rto_charge: r.rto_charge, cod_charge: r.cod_charge, other_deductions: r.other_deductions, utr_reference: r.utr_reference, status: r.status, notes: r.notes });
    setFormOpen(true);
  }
  function submit() {
    onSave({ ...form, remittance_date: new Date(form.remittance_date).toISOString(), order_id: null, net_amount: 0 } as Omit<Remittance, "id">, editId);
    setFormOpen(false);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      setPreview(XLSX.utils.sheet_to_json(sheet) as Record<string, any>[]);
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <div className="font-display text-[22px] font-semibold">Remittance</div>
          <div className="text-muted text-[13px] mt-1">What Shiprocket/Delhivery actually paid out, after RTO and COD deductions</div>
        </div>
        <button onClick={openNew} className="px-3.5 py-2 rounded-md bg-amber text-[#1A1206] text-[13px] font-semibold">+ Add remittance</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi label="Net remitted" value={fmtMoney(totalNet)} sub="All-time, after deductions" color="teal" />
        <Kpi label="RTO charges" value={fmtMoney(totalRto)} sub="Deducted for returned orders" color="red" />
        <Kpi label="Total deductions" value={fmtMoney(totalDeductions)} sub="RTO + COD fee + other" color="amber" />
        <Kpi label="Awaiting remittance" value={String(awaitingRemittance.length)} sub="Delivered, not yet recorded" />
      </div>

      <div className="bg-panel border border-bordersoft rounded-[10px] p-[18px] mb-5">
        <div className="font-display font-semibold text-[14.5px] mb-2">Bulk import remittance report</div>
        <div className="text-[12px] text-muted mb-3">
          Export your COD Remittance report from Shiprocket (Billing → COD Remittance) or Delhivery One (COD Remittance), then upload it here — columns like Order/AWB, Amount, RTO Charge, COD Charge, UTR are matched automatically.
        </div>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="text-[12.5px] text-muted" />
        {preview.length > 0 && (
          <div className="mt-3 border border-bordersoft rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-panel2">
              <span className="text-[12px] text-muted">{fileName} — {preview.length} rows</span>
              <button onClick={() => { onImportRows(preview); setPreview([]); setFileName(""); }} className="px-3 py-1.5 rounded-md bg-amber text-[#1A1206] text-[12px] font-semibold">Apply import</button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-panel border border-bordersoft rounded-[10px] overflow-hidden">
        <div className="px-[18px] py-3.5 border-b border-bordersoft font-display font-semibold text-[14.5px]">Remittance history</div>
        {remittances.length === 0 ? (
          <div className="py-12 text-center text-muted text-[12.5px]">No remittances recorded yet — add one manually or import a courier report above.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead><tr>{["Order", "Courier", "Date", "Gross", "Deductions", "Net", "UTR", ""].map((h) => <th key={h} className="text-left px-4 py-2.5 text-[10.5px] uppercase tracking-wide text-muted2 font-semibold border-b border-bordersoft whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {remittances.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 border-b border-bordersoft font-mono text-[12.5px]">{r.order_number}</td>
                  <td className="px-4 py-2.5 border-b border-bordersoft">{r.courier}</td>
                  <td className="px-4 py-2.5 border-b border-bordersoft font-mono text-[12px] text-muted">{fmtDate(r.remittance_date)}</td>
                  <td className="px-4 py-2.5 border-b border-bordersoft font-mono">{fmtMoney(r.gross_amount)}</td>
                  <td className="px-4 py-2.5 border-b border-bordersoft font-mono text-red">-{fmtMoney(r.rto_charge + r.cod_charge + r.other_deductions)}</td>
                  <td className="px-4 py-2.5 border-b border-bordersoft font-mono text-teal font-semibold">{fmtMoney(r.net_amount)}</td>
                  <td className="px-4 py-2.5 border-b border-bordersoft font-mono text-[11.5px] text-muted">{r.utr_reference || "—"}</td>
                  <td className="px-4 py-2.5 border-b border-bordersoft text-right whitespace-nowrap">
                    <button onClick={() => openEditR(r)} className="text-[12px] px-2.5 py-1 rounded-md border border-bordersoft text-muted mr-1.5">Edit</button>
                    <button onClick={() => onDelete(r.id)} className="text-[12px] px-2.5 py-1 rounded-md border border-red text-red">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-5" onClick={(e) => e.target === e.currentTarget && setFormOpen(false)}>
          <div className="bg-panel border border-border rounded-xl w-full max-w-lg max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-bordersoft">
              <div className="font-display font-semibold text-[16px]">{editId ? "Edit remittance" : "New remittance"}</div>
              <button onClick={() => setFormOpen(false)} className="text-muted text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <Field label="Order # / AWB"><input className="f-input" value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value })} /></Field>
              <Field label="Date"><input type="date" className="f-input" value={form.remittance_date} onChange={(e) => setForm({ ...form, remittance_date: e.target.value })} /></Field>
              <Field label="Courier">
                <select className="f-input" value={form.courier} onChange={(e) => setForm({ ...form, courier: e.target.value })}>
                  {COURIERS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className="f-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {["Pending", "Remitted", "On Hold"].map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Gross amount (₹)"><input type="number" className="f-input" value={form.gross_amount} onChange={(e) => setForm({ ...form, gross_amount: parseFloat(e.target.value) || 0 })} /></Field>
              <Field label="RTO charge (₹)"><input type="number" className="f-input" value={form.rto_charge} onChange={(e) => setForm({ ...form, rto_charge: parseFloat(e.target.value) || 0 })} /></Field>
              <Field label="COD charge (₹)"><input type="number" className="f-input" value={form.cod_charge} onChange={(e) => setForm({ ...form, cod_charge: parseFloat(e.target.value) || 0 })} /></Field>
              <Field label="Other deductions (₹)"><input type="number" className="f-input" value={form.other_deductions} onChange={(e) => setForm({ ...form, other_deductions: parseFloat(e.target.value) || 0 })} /></Field>
              <Field label="UTR / reference"><input className="f-input" value={form.utr_reference} onChange={(e) => setForm({ ...form, utr_reference: e.target.value })} /></Field>
              <div className="col-span-2"><Field label="Notes"><input className="f-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-bordersoft">
              <button onClick={() => setFormOpen(false)} className="px-3.5 py-2 rounded-md border border-bordersoft text-muted text-[13px]">Cancel</button>
              <button onClick={submit} className="px-3.5 py-2 rounded-md bg-amber text-[#1A1206] font-semibold text-[13px]">Save remittance</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ImportView({ onImportRows, onSyncShopify, onSyncTracking, syncing }: { onImportRows: (rows: Record<string, any>[]) => void; onSyncShopify: () => void; onSyncTracking: () => void; syncing: boolean }) {
  const [preview, setPreview] = useState<Record<string, any>[]>([]);
  const [fileName, setFileName] = useState("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, any>[];
      setPreview(rows);
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <>
      <div className="mb-5">
        <div className="font-display text-[22px] font-semibold">Import &amp; Sync</div>
        <div className="text-muted text-[13px] mt-1">Pull live orders from Shopify, refresh courier status, or bulk-upload a return/status sheet</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="bg-panel border border-bordersoft rounded-[10px] p-[18px]">
          <div className="font-display font-semibold text-[14.5px] mb-2">Sync from Shopify</div>
          <div className="text-[12px] text-muted mb-3.5">Pulls your latest 250 orders directly from your connected Shopify store.</div>
          <button onClick={onSyncShopify} disabled={syncing} className="px-3.5 py-2 rounded-md bg-amber text-[#1A1206] text-[13px] font-semibold disabled:opacity-60">
            {syncing ? "Syncing…" : "⇅ Sync now"}
          </button>
        </div>

        <div className="bg-panel border border-bordersoft rounded-[10px] p-[18px]">
          <div className="font-display font-semibold text-[14.5px] mb-2">Refresh courier status</div>
          <div className="text-[12px] text-muted mb-3.5">Checks Shiprocket &amp; Delhivery for the latest status on every order that isn't delivered/RTO'd/cancelled yet, using their tracking API.</div>
          <button onClick={onSyncTracking} disabled={syncing} className="px-3.5 py-2 rounded-md bg-amber text-[#1A1206] text-[13px] font-semibold disabled:opacity-60">
            {syncing ? "Checking…" : "⇅ Refresh tracking"}
          </button>
        </div>

        <div className="bg-panel border border-bordersoft rounded-[10px] p-[18px]">
          <div className="font-display font-semibold text-[14.5px] mb-2">Bulk import (CSV / Excel)</div>
          <div className="text-[12px] text-muted mb-3.5">
            Upload a courier return/status sheet. Matched by <strong>Order #</strong> or <strong>AWB</strong>, overwrites status/reason/courier/notes. Unmatched rows are added as new orders.
          </div>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="text-[12.5px] text-muted" />
        </div>
      </div>

      {preview.length > 0 && (
        <div className="bg-panel border border-bordersoft rounded-[10px] overflow-hidden">
          <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-bordersoft">
            <div className="font-display font-semibold text-[14.5px]">Preview — {fileName} ({preview.length} rows)</div>
            <button
              onClick={() => { onImportRows(preview); setPreview([]); setFileName(""); }}
              className="px-3.5 py-2 rounded-md bg-amber text-[#1A1206] text-[13px] font-semibold"
            >
              Apply import
            </button>
          </div>
          <div className="overflow-x-auto max-h-[360px]">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  {Object.keys(preview[0]).map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] uppercase tracking-wide text-muted2 font-semibold border-b border-bordersoft whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 20).map((row, i) => (
                  <tr key={i}>
                    {Object.keys(preview[0]).map((h) => (
                      <td key={h} className="px-3 py-1.5 border-b border-bordersoft whitespace-nowrap">{String(row[h] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 20 && <div className="text-[11.5px] text-muted px-[18px] py-2.5">Showing first 20 of {preview.length} rows — all will be processed on apply.</div>}
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-muted mb-1.5 font-semibold uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}
