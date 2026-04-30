import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  Film,
  File as FileIcon,
  Trash2,
  Download,
  Pencil,
  FolderPlus,
  Folder,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppBar } from "@/components/app-bar";
import { Fab } from "@/components/fab";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatBytes, formatTime } from "@/lib/format";

export const Route = createFileRoute("/app/storage/")({
  component: Storage,
});

interface FileRow {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
  folder_id: string | null;
  created_at: string;
}

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
}

function iconFor(mime: string | null) {
  if (!mime) return FileIcon;
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.startsWith("video/")) return Film;
  if (mime.includes("pdf") || mime.startsWith("text/")) return FileText;
  return FileIcon;
}

function Storage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [confirmDelFile, setConfirmDelFile] = useState<FileRow | null>(null);
  const [confirmDelFolder, setConfirmDelFolder] = useState<FolderRow | null>(null);
  const [renameTarget, setRenameTarget] = useState<FileRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [quota, setQuota] = useState<{ used: number; total: number }>({ used: 0, total: 5368709120 });
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: fs }, { data: fl }, { data: q }] = await Promise.all([
      supabase
        .from("files")
        .select("id, name, storage_path, mime_type, size_bytes, folder_id, created_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("folders").select("id, name, parent_id").eq("owner_id", user.id).order("name"),
      supabase.from("storage_quota").select("used_bytes, total_bytes").eq("user_id", user.id).single(),
    ]);
    setFiles(fs ?? []);
    setFolders(fl ?? []);
    if (q) setQuota({ used: Number(q.used_bytes), total: Number(q.total_bytes) });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleFiles = files.filter((f) => f.folder_id === currentFolder);
  const visibleFolders = folders.filter((f) => f.parent_id === currentFolder);
  const breadcrumb = (() => {
    const out: FolderRow[] = [];
    let cur = folders.find((f) => f.id === currentFolder) ?? null;
    while (cur) {
      out.unshift(cur);
      cur = folders.find((f) => f.id === cur!.parent_id) ?? null;
    }
    return out;
  })();

  const upload = async (fileList: FileList | File[]) => {
    if (!user) return;
    const arr = Array.from(fileList);
    if (!arr.length) return;
    setUploading(true);
    let done = 0;
    for (const f of arr) {
      try {
        if (quota.used + f.size > quota.total) {
          toast.error(`No hay espacio para ${f.name}`);
          continue;
        }
        if (f.size > 50 * 1024 * 1024) {
          toast.error(`${f.name} supera 50MB`);
          continue;
        }
        const path = `${user.id}/${crypto.randomUUID()}-${f.name}`;
        const { error: upErr } = await supabase.storage.from("files").upload(path, f, {
          cacheControl: "3600",
          upsert: false,
          contentType: f.type || "application/octet-stream",
        });
        if (upErr) throw upErr;
        const { error: dbErr } = await supabase.from("files").insert({
          owner_id: user.id,
          folder_id: currentFolder,
          name: f.name,
          storage_path: path,
          mime_type: f.type || null,
          size_bytes: f.size,
        });
        if (dbErr) throw dbErr;
        toast.success(`${f.name} subido`);
      } catch (e) {
        toast.error(`${f.name}: ${e instanceof Error ? e.message : "error"}`);
      } finally {
        done += 1;
        setProgress(Math.round((done / arr.length) * 100));
      }
    }
    setUploading(false);
    setProgress(0);
    load();
  };

  const onPickFile = () => inputRef.current?.click();

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) upload(e.dataTransfer.files);
  };

  const deleteFile = async (f: FileRow) => {
    const { error: sErr } = await supabase.storage.from("files").remove([f.storage_path]);
    if (sErr) {
      toast.error("No se pudo borrar el archivo del almacén");
      return;
    }
    const { error } = await supabase.from("files").delete().eq("id", f.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
    setQuota((q) => ({ ...q, used: Math.max(0, q.used - f.size_bytes) }));
    toast.success("Archivo eliminado");
  };

  const renameFile = async () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.error("Nombre requerido");
      return;
    }
    const { error } = await supabase.from("files").update({ name: trimmed }).eq("id", renameTarget.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFiles((prev) => prev.map((x) => (x.id === renameTarget.id ? { ...x, name: trimmed } : x)));
    toast.success("Renombrado");
    setRenameTarget(null);
  };

  const openFile = async (f: FileRow) => {
    const { data, error } = await supabase.storage.from("files").createSignedUrl(f.storage_path, 60);
    if (error || !data) {
      toast.error("No se pudo abrir");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const createFolder = async () => {
    if (!user) return;
    const name = newFolderName.trim();
    if (!name) {
      toast.error("Nombre requerido");
      return;
    }
    const { data, error } = await supabase
      .from("folders")
      .insert({ owner_id: user.id, parent_id: currentFolder, name })
      .select("id, name, parent_id")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setFolders((prev) => [...prev, data]);
    setShowNewFolder(false);
    setNewFolderName("");
    toast.success("Carpeta creada");
  };

  const deleteFolder = async (f: FolderRow) => {
    const { error } = await supabase.from("folders").delete().eq("id", f.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFolders((prev) => prev.filter((x) => x.id !== f.id));
    toast.success("Carpeta eliminada");
    load();
  };

  const usedPct = Math.min(100, (quota.used / quota.total) * 100);

  return (
    <>
      <AppBar title="Archivos" subtitle="Tu Drive personal" />

      {/* Quota card */}
      <div className="px-3 pt-3">
        <div className="glass rounded-3xl p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-muted-foreground">Almacenamiento</p>
            <p className="text-sm">
              <span className="font-semibold">{formatBytes(quota.used)}</span>{" "}
              <span className="text-muted-foreground">/ {formatBytes(quota.total)}</span>
            </p>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-glass">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-5 pt-4 text-sm text-muted-foreground">
        <button
          onClick={() => setCurrentFolder(null)}
          className={`hover:text-foreground ${currentFolder === null ? "text-foreground font-medium" : ""}`}
        >
          Inicio
        </button>
        {breadcrumb.map((b) => (
          <span key={b.id} className="flex items-center gap-1">
            <span className="text-muted-foreground/60">/</span>
            <button
              onClick={() => setCurrentFolder(b.id)}
              className="hover:text-foreground text-foreground font-medium"
            >
              {b.name}
            </button>
          </span>
        ))}
      </div>

      {/* Drop zone + grid */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`mx-3 mt-3 rounded-3xl border-2 border-dashed transition ${
          dragOver ? "border-primary bg-glass-strong" : "border-transparent"
        }`}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : visibleFolders.length === 0 && visibleFiles.length === 0 ? (
          <div className="glass rounded-3xl px-6 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-glass-strong">
              <Upload className="h-5 w-5" />
            </div>
            <p className="mt-3 font-medium">Carpeta vacía</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Arrastra archivos aquí o usa el botón <span className="text-foreground">+</span>.
            </p>
          </div>
        ) : (
          <div className="space-y-2 p-1">
            {visibleFolders.map((f) => (
              <div
                key={f.id}
                className="glass flex items-center gap-3 rounded-2xl p-3 transition hover:bg-glass-strong"
              >
                <button
                  onClick={() => setCurrentFolder(f.id)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-glass-strong">
                    <Folder className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground">Carpeta</p>
                  </div>
                </button>
                <button
                  onClick={() => setConfirmDelFolder(f)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                  aria-label="Eliminar carpeta"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {visibleFiles.map((f) => {
              const Icon = iconFor(f.mime_type);
              return (
                <div
                  key={f.id}
                  className="glass flex items-center gap-3 rounded-2xl p-3 transition hover:bg-glass-strong"
                >
                  <button onClick={() => openFile(f)} className="flex flex-1 items-center gap-3 text-left">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-glass-strong">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{f.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(f.size_bytes)} · {formatTime(f.created_at)}
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => openFile(f)}
                    className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-glass-strong"
                    aria-label="Descargar"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setRenameTarget(f);
                      setRenameValue(f.name);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-glass-strong"
                    aria-label="Renombrar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDelFile(f)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) upload(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Upload progress */}
      {uploading && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2">
          <div className="glass-strong flex items-center gap-3 rounded-full px-5 py-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Subiendo… {progress}%
          </div>
        </div>
      )}

      {/* Action sheet */}
      <div className="fixed bottom-24 right-5 z-40 flex flex-col items-end gap-3">
        <button
          onClick={() => setShowNewFolder(true)}
          className="glass-strong flex h-12 w-12 items-center justify-center rounded-full text-foreground"
          aria-label="Nueva carpeta"
        >
          <FolderPlus className="h-5 w-5" />
        </button>
        <Fab onClick={onPickFile} icon={Upload} label="Subir archivo" />
      </div>

      <ConfirmDialog
        open={!!confirmDelFile}
        onOpenChange={(o) => !o && setConfirmDelFile(null)}
        title="Eliminar archivo"
        description={
          <>
            ¿Eliminar <span className="text-foreground font-medium">{confirmDelFile?.name}</span>? Esta acción no se puede deshacer.
          </>
        }
        destructive
        confirmLabel="Eliminar"
        onConfirm={async () => { if (confirmDelFile) await deleteFile(confirmDelFile); }}
      />
      <ConfirmDialog
        open={!!confirmDelFolder}
        onOpenChange={(o) => !o && setConfirmDelFolder(null)}
        title="Eliminar carpeta"
        description={
          <>
            ¿Eliminar la carpeta <span className="text-foreground font-medium">{confirmDelFolder?.name}</span>? Los archivos quedarán sueltos en la raíz.
          </>
        }
        destructive
        confirmLabel="Eliminar"
        onConfirm={async () => { if (confirmDelFolder) await deleteFolder(confirmDelFolder); }}
      />

      {/* Rename modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setRenameTarget(null)} />
          <div className="glass-strong relative w-full max-w-sm rounded-3xl p-6 animate-slide-up">
            <h2 className="text-lg font-semibold">Renombrar</h2>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && renameFile()}
              className="mt-4 w-full rounded-2xl glass-subtle px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-5 flex gap-2">
              <button onClick={() => setRenameTarget(null)} className="flex-1 rounded-full glass-subtle py-2.5 text-sm font-medium">
                Cancelar
              </button>
              <button onClick={renameFile} className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New folder */}
      {showNewFolder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setShowNewFolder(false)} />
          <div className="glass-strong relative w-full max-w-sm rounded-3xl p-6 animate-slide-up">
            <h2 className="text-lg font-semibold">Nueva carpeta</h2>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createFolder()}
              placeholder="Nombre"
              className="mt-4 w-full rounded-2xl glass-subtle px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowNewFolder(false)} className="flex-1 rounded-full glass-subtle py-2.5 text-sm font-medium">
                Cancelar
              </button>
              <button onClick={createFolder} className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground">
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
