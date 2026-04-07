"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const ALL_METRICS = [
  { key: "messages", label: "Messages Started" },
  { key: "cost_per_message", label: "Cost per Message" },
  { key: "ctr", label: "CTR" },
  { key: "clicks", label: "Link Clicks" },
  { key: "spend", label: "Amount Spent" },
  { key: "frequency", label: "Frequency" },
  { key: "impressions", label: "Impressions" },
  { key: "unique_clicks", label: "Unique Link Clicks" },
  { key: "reach", label: "Reach" },
  { key: "cpm", label: "CPM" },
  { key: "leads", label: "Leads" },
  { key: "cost_per_lead", label: "Cost per Lead" },
  { key: "post_shares", label: "Post Shares" },
  { key: "page_likes", label: "Page Likes" },
  { key: "post_engagement", label: "Post Engagement" },
  { key: "cost_per_engagement", label: "Cost / Engagement" },
  { key: "cost_per_like", label: "Cost / Like" },
];

export default function HighlightsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [highlights, setHighlights] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/highlights?list=campaigns").then((r) => {
        if (r.status === 401) {
          router.push("/admin/login");
          return null;
        }
        return r.json();
      }),
    ]).then(([data]) => {
      if (data) {
        setCampaigns(data.campaigns ?? []);
        setHighlights(data.highlights ?? {});
      }
      setLoading(false);
    });
  }, [router]);

  function toggle(campaign: string, metric: string) {
    setHighlights((prev) => {
      const current = prev[campaign] ?? [];
      const next = current.includes(metric)
        ? current.filter((m) => m !== metric)
        : [...current, metric];
      return { ...prev, [campaign]: next };
    });
  }

  async function save(campaign: string) {
    setSaving(campaign);
    await fetch("/api/admin/highlights", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_name: campaign,
        metrics: highlights[campaign] ?? [],
      }),
    });
    setSaving(null);
  }

  async function applyToAll(sourceCampaign: string) {
    const metrics = highlights[sourceCampaign] ?? [];
    const updated: Record<string, string[]> = { ...highlights };
    for (const c of campaigns) {
      updated[c] = [...metrics];
    }
    setHighlights(updated);

    // Save all
    setSaving("__all__");
    await Promise.all(
      campaigns.map((c) =>
        fetch("/api/admin/highlights", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaign_name: c, metrics }),
        }),
      ),
    );
    setSaving(null);
  }

  const filtered = campaigns.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/admin")}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ← Accounts
          </button>
          <h1 className="text-xl font-bold text-gray-900">Highlight Metrics</h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {loading ? (
          <p className="text-gray-400 text-center py-8">Loading…</p>
        ) : (
          <>
            <div className="mb-6">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหา Campaign..."
                className="input"
              />
            </div>

            <div className="space-y-4">
              {filtered.map((campaign) => (
                <div
                  key={campaign}
                  className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
                  data-aos="fade-up"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3
                      className="text-sm font-semibold text-gray-900 truncate max-w-md"
                      title={campaign}
                    >
                      {campaign}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => applyToAll(campaign)}
                        disabled={saving !== null}
                        className="text-xs text-secondary hover:text-primary font-medium px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                      >
                        {saving === "__all__"
                          ? "กำลังบันทึก..."
                          : "ใช้กับทุก Campaign"}
                      </button>
                      <button
                        onClick={() => save(campaign)}
                        disabled={saving !== null}
                        className="text-xs text-black bg-primary hover:bg-primary-dark font-medium px-3 py-1 rounded-lg disabled:opacity-50"
                      >
                        {saving === campaign ? "กำลังบันทึก..." : "บันทึก"}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_METRICS.map((m) => {
                      const active = (highlights[campaign] ?? []).includes(
                        m.key,
                      );
                      return (
                        <button
                          key={m.key}
                          onClick={() => toggle(campaign, m.key)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                            active
                              ? "bg-primary text-black border-primary"
                              : "bg-white text-gray-600 border-gray-300 hover:border-secondary hover:text-secondary"
                          }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
