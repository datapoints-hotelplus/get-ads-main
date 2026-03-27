import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { getSupabase } from "@/lib/supabase";

const FB_GRAPH_API = "https://graph.facebook.com/v25.0";

type FBItem = Record<string, unknown>;

async function fetchReach(
  accountId: string,
  accessToken: string,
  since: string,
  until: string,
  adIds?: string[],
): Promise<number> {
  let reach = 0;
  const level = adIds && adIds.length > 0 ? "ad" : "account";
  const filtering = adIds && adIds.length > 0
    ? `&filtering=${encodeURIComponent(JSON.stringify([{ field: "ad.id", operator: "IN", value: adIds }]))}`
    : "";

  let url: string | null =
    `${FB_GRAPH_API}/${accountId}/insights?fields=reach` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    `&level=${level}${filtering}&access_token=${accessToken}`;

  while (url) {
    const res: { data: { data?: FBItem[]; paging?: { next?: string } } } = await axios.get(url);
    for (const item of res.data.data ?? []) {
      reach += parseInt(String(item.reach ?? "0"), 10);
    }
    url = res.data.paging?.next ?? null;
  }
  return reach;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { startDate, endDate, account_name, ad_id } = body as {
    startDate?: string;
    endDate?: string;
    account_name?: string | string[];
    ad_id?: string | string[];
  };

  const adIds = ad_id
    ? (Array.isArray(ad_id) ? ad_id : [ad_id]).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean)
    : [];

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
  }

  const accessToken = process.env.FB_ACCESS_TOKEN;
  if (!accessToken) return NextResponse.json({ error: "FB_ACCESS_TOKEN not set" }, { status: 500 });

  const supabase = getSupabase();
  let query = supabase.from("allpage").select("account_id, account_name");

  const names = account_name
    ? (Array.isArray(account_name) ? account_name : [account_name]).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean)
    : [];
  if (names.length > 0) query = query.in("account_name", names);

  const { data: pageRows, error: pageErr } = await query;
  if (pageErr) return NextResponse.json({ error: pageErr.message }, { status: 500 });

  const accounts = (pageRows ?? []) as { account_id: string; account_name: string }[];
  if (!accounts.length) return NextResponse.json({ error: "ไม่พบ account — ตรวจสอบ account_name หรือรัน Get All Page ก่อน" }, { status: 400 });

  let totalReach = 0;
  const breakdown: { account_name: string; reach: number }[] = [];

  for (const acc of accounts) {
    const reach = await fetchReach(acc.account_id, accessToken, startDate, endDate, adIds.length > 0 ? adIds : undefined);
    totalReach += reach;
    breakdown.push({ account_name: acc.account_name, reach });
  }

  return NextResponse.json({ reach: totalReach, startDate, endDate, accounts: breakdown });
}
