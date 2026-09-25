import type { Frequency, PipelineSettings } from "./schedule";
import { supabase } from "./supabase";

export * from "./schedule";

export async function getPipelineSettings(): Promise<PipelineSettings> {
  const { data, error } = await supabase
    .from("pipeline_settings")
    .select("frequency, weekly_day, updated_at")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data as PipelineSettings;
}

export async function savePipelineSettings(frequency: Frequency, weeklyDay: number): Promise<void> {
  const { error } = await supabase
    .from("pipeline_settings")
    .update({ frequency, weekly_day: weeklyDay, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}
