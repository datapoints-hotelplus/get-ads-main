import { NextResponse } from "next/server";
import axios from "axios";
import { getSupabase } from "@/lib/supabase";

const FB_GRAPH_API = "https://graph.facebook.com/v25.0";

export async function POST() {
  const accessToken = process.env.FB_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "FB_ACCESS_TOKEN not set" }, { status: 500 });
  }

  // 1. Fetch all ad accounts from Facebook
  const fbRes = await axios.get(`${FB_GRAPH_API}/me/adaccounts`, {
    params: { fields: "name,account_id", limit: 200, access_token: accessToken },
  });

  const accounts: { name: string; account_id: string }[] = fbRes.data.data ?? [];

  if (accounts.length === 0) {
    return NextResponse.json({ error: "ไม่พบ Ad Account ที่เชื่อมกับ token นี้" }, { status: 404 });
  }

  // 2. Clear + insert into Supabase "ads_allpage" table
  const supabase = getSupabase();

  const { error: delErr } = await supabase.from("ads_allpage").delete().neq("account_id", "");
  if (delErr) return NextResponse.json({ error: `Delete failed: ${delErr.message}` }, { status: 500 });

  const rows = accounts.map((a) => ({ account_name: a.name, account_id: `act_${a.account_id}` }));

  const { error: insErr } = await supabase.from("ads_allpage").insert(rows);
  if (insErr) return NextResponse.json({ error: `Insert failed: ${insErr.message}` }, { status: 500 });

  return NextResponse.json({ success: true, count: rows.length, accounts: rows });
}
