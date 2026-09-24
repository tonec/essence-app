import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stars")
    .select("id, star_name, tier, status, user_id, created_at")
    .in("status", ["RESERVED", "CLAIMED"]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ stars: data ?? [] });
}
