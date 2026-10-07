import { supabase } from "@/integrations/supabase/client";

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** Uploads an avatar into the user's own folder and saves its public URL on the profile. */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("not_image");
  if (file.size > MAX_AVATAR_BYTES) throw new Error("too_large");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });
  if (error) throw error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const { error: upErr } = await supabase
    .from("profiles")
    .update({ avatar_url: data.publicUrl, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (upErr) throw upErr;
  return data.publicUrl;
}
