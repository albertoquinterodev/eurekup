import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
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
  FolderOpen,
  Loader2,
  ChevronRight,
  Plus,
  HardDrive,
  Layers,
  X,
  Search,
  FolderInput,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppBar } from "@/components/app-bar";
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [confirmDelFile, setConfirmDelFile] = useState<FileRow | null>(null);
  const [confirmDelFolder, setConfirmDelFolder] = useState<FolderRow | null>(null);
  const [renameTarget, setRenameTarget] = useState<FileRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showNewFolder, setShowNewFolder] = useState<{ parent: string | null } | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showInternalPicker, setShowInternalPicker] = useState(false);
  const [internalTargetFolder, setInternalTargetFolder] = useState<string | null>(null);
  const [pendingUploadFolder, setPendingUploadFolder] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | "root" | null>(null);
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ used: number; total: number }>({ used: 0, total: 5368709120 });
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [moveTarget, setMoveTarget] = useState<FileRow | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggleSelect = (id: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => {
    setSelectedFiles(new Set());
    setSelecting(false);
  };
  const bulkMove = async (folderId: string | null) => {
    const ids = Array.from(selectedFiles);
    if (!ids.length) return;
    const { error } = await supabase.from("files").update({ folder_id: folderId }).in("id", ids);
    if (error) {
      toast.error("No se pudieron mover");
      return;
    }
    setFiles((prev) => prev.map((f) => (selectedFiles.has(f.id) ? { ...f, folder_id: folderId } : f)));
    toast.success(`${ids.length} movidos`);
    setBulkMoveOpen(false);
    clearSelection();
  };
  const bulkDelete = async () => {
    const targets = files.filter((f) => selectedFiles.has(f.id));
    if (!targets.length) return;
    const paths = targets.map((f) => f.storage_path);
    await supabase.storage.from("files").remove(paths);
    const { error } = await supabase.from("files").delete().in("id", targets.map((t) => t.id));
    if (error) {
      toast.error(error.message);
      return;
    }
    setFiles((prev) => prev.filter((f) => !selectedFiles.has(f.id)));
    setQuota((q) => ({ ...q, used: Math.max(0, q.used - targets.reduce((a, t) => a + t.size_bytes, 0)) }));
    toast.success(`${targets.length} eliminados`);
    setConfirmBulkDelete(false);
    clearSelection();
  };

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

  // Realtime sync — files, folders, quota for current user.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`storage-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "files", filter: `owner_id=eq.${user.id}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "folders", filter: `owner_id=eq.${user.id}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "storage_quota", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const q = payload.new as { used_bytes: number; total_bytes: number };
          setQuota({ used: Number(q.used_bytes), total: Number(q.total_bytes) });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  // Build a map: parent_id -> folders[], parent_id (folder or null) -> files[]
  const childFolders = useMemo(() => {
    const map = new Map<string | null, FolderRow[]>();
    for (const f of folders) {
      const k = f.parent_id;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(f);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [folders]);

  const filesIn = useMemo(() => {
    const map = new Map<string | null, FileRow[]>();
    for (const f of files) {
      const k = f.folder_id;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(f);
    }
    return map;
  }, [files]);

  // Search results — flat lists when query is active.
  const q = query.trim().toLowerCase();
  const searchActive = q.length > 0;
  const matchingFiles = useMemo(
    () => (searchActive ? files.filter((f) => f.name.toLowerCase().includes(q)) : []),
    [files, q, searchActive]
  );
  const matchingFolders = useMemo(
    () => (searchActive ? folders.filter((f) => f.name.toLowerCase().includes(q)) : []),
    [folders, q, searchActive]
  );

  const folderPath = (id: string | null): string => {
    if (!id) return "Inicio";
    const parts: string[] = [];
    let cur: FolderRow | undefined = folders.find((f) => f.id === id);
    while (cur) {
      parts.unshift(cur.name);
      cur = cur.parent_id ? folders.find((f) => f.id === cur!.parent_id) : undefined;
    }
    return parts.join(" / ") || "Inicio";
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const upload = async (fileList: FileList | File[], folderId: string | null) => {
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
          folder_id: folderId,
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
    if (folderId) setExpanded((prev) => new Set(prev).add(folderId));
    load();
  };

  const moveFileToFolder = async (fileId: string, folderId: string | null) => {
    const file = files.find((f) => f.id === fileId);
    if (!file || file.folder_id === folderId) return;
    // Optimistic update
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, folder_id: folderId } : f)));
    const { error } = await supabase.from("files").update({ folder_id: folderId }).eq("id", fileId);
    if (error) {
      toast.error("No se pudo mover");
      // revert
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, folder_id: file.folder_id } : f)));
      return;
    }
    if (folderId) setExpanded((prev) => new Set(prev).add(folderId));
    toast.success(`Movido a ${folderId ? folders.find((x) => x.id === folderId)?.name ?? "carpeta" : "Inicio"}`);
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
    if (!user || !showNewFolder) return;
    const name = newFolderName.trim();
    if (!name) {
      toast.error("Nombre requerido");
      return;
    }
    const { data, error } = await supabase
      .from("folders")
      .insert({ owner_id: user.id, parent_id: showNewFolder.parent, name })
      .select("id, name, parent_id")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setFolders((prev) => [...prev, data]);
    if (showNewFolder.parent) setExpanded((prev) => new Set(prev).add(showNewFolder.parent!));
    setShowNewFolder(null);
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

  const onPickFromDevice = (folderId: string | null) => {
    setPendingUploadFolder(folderId);
    setShowSourcePicker(false);
    // Defer to next tick so the input picks up before the modal unmounts
    setTimeout(() => inputRef.current?.click(), 0);
  };

  const onPickFromInternal = (folderId: string | null) => {
    setInternalTargetFolder(folderId);
    setShowSourcePicker(false);
    setShowInternalPicker(true);
  };

  const copyFromInternal = async (sourceFile: FileRow) => {
    if (sourceFile.folder_id === internalTargetFolder) {
      toast.message("El archivo ya está en esta carpeta");
      return;
    }
    await moveFileToFolder(sourceFile.id, internalTargetFolder);
    setShowInternalPicker(false);
  };

  const usedPct = Math.min(100, (quota.used / quota.total) * 100);

  const rootFolders = childFolders.get(null) ?? [];
  const rootFiles = filesIn.get(null) ?? [];

  // Recursive folder tree row.
  const FolderNode = ({ folder, depth }: { folder: FolderRow; depth: number }) => {
    const isOpen = expanded.has(folder.id);
    const subs = childFolders.get(folder.id) ?? [];
    const ff = filesIn.get(folder.id) ?? [];
    const empty = subs.length === 0 && ff.length === 0;
    const isDropTarget = dragOverFolder === folder.id;
    return (
      <div>
        <div
          onDragOver={(e) => {
            if (draggingFileId) {
              e.preventDefault();
              setDragOverFolder(folder.id);
            }
          }}
          onDragLeave={() => setDragOverFolder((cur) => (cur === folder.id ? null : cur))}
          onDrop={async (e) => {
            e.preventDefault();
            setDragOverFolder(null);
            if (draggingFileId) {
              await moveFileToFolder(draggingFileId, folder.id);
              setDraggingFileId(null);
            } else if (e.dataTransfer?.files?.length) {
              upload(e.dataTransfer.files, folder.id);
            }
          }}
          className={`group flex items-center gap-2 rounded-2xl px-2 py-2 transition ${
            isDropTarget ? "bg-primary/15 ring-2 ring-primary/50" : "hover:bg-glass"
          }`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <button
            onClick={() => toggleExpand(folder.id)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-glass-strong hover:text-foreground"
            aria-label={isOpen ? "Cerrar" : "Abrir"}
          >
            <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronRight className="h-4 w-4" />
            </motion.span>
          </button>
          <button
            onClick={() => toggleExpand(folder.id)}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-glass-strong">
              {isOpen ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
            </div>
            <span className="truncate text-sm font-medium">{folder.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {ff.length + subs.length || ""}
            </span>
          </button>
          <button
            onClick={() => {
              setShowNewFolder({ parent: folder.id });
            }}
            className="hidden h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-glass-strong hover:text-foreground group-hover:flex"
            aria-label="Nueva subcarpeta"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setPendingUploadFolder(folder.id);
              setShowSourcePicker(true);
            }}
            className="hidden h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-glass-strong hover:text-foreground group-hover:flex"
            aria-label="Añadir aquí"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => setConfirmDelFolder(folder)}
            className="hidden h-8 w-8 items-center justify-center rounded-full text-destructive hover:bg-destructive/10 group-hover:flex"
            aria-label="Eliminar carpeta"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="space-y-1 py-1">
                {empty && (
                  <div
                    className="rounded-xl px-2 py-3 text-xs text-muted-foreground"
                    style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }}
                  >
                    Vacía. Arrastra archivos aquí o pulsa <span className="text-foreground">+</span>.
                  </div>
                )}
                {subs.map((s) => (
                  <FolderNode key={s.id} folder={s} depth={depth + 1} />
                ))}
                {ff.map((file) => (
                  <FileRowItem key={file.id} file={file} depth={depth + 1} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const FileRowItem = ({ file, depth }: { file: FileRow; depth: number }) => {
    const Icon = iconFor(file.mime_type);
    const checked = selectedFiles.has(file.id);
    return (
      <div
        draggable={!selecting}
        onDragStart={(e) => {
          setDraggingFileId(file.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDraggingFileId(null)}
        className={`group flex items-center gap-2 rounded-2xl px-2 py-2 transition hover:bg-glass ${
          draggingFileId === file.id ? "opacity-50" : ""
        } ${checked ? "bg-primary/10" : ""}`}
        style={{ paddingLeft: `${depth * 14 + 36}px` }}
      >
        {selecting && (
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggleSelect(file.id)}
            className="h-4 w-4 accent-primary"
            aria-label="Seleccionar"
          />
        )}
        <button
          onClick={() => (selecting ? toggleSelect(file.id) : openFile(file))}
          onContextMenu={(e) => {
            e.preventDefault();
            setSelecting(true);
            toggleSelect(file.id);
          }}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-glass-strong">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(file.size_bytes)} · {formatTime(file.created_at)}
            </p>
          </div>
        </button>
        <button
          onClick={() => openFile(file)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-glass-strong hover:text-foreground sm:hidden sm:group-hover:flex"
          aria-label="Descargar"
        >
          <Download className="h-4 w-4" />
        </button>
        <button
          onClick={() => setMoveTarget(file)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-glass-strong hover:text-foreground"
          aria-label="Mover a"
          title="Mover a otra carpeta"
        >
          <FolderInput className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            setRenameTarget(file);
            setRenameValue(file.name);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-glass-strong hover:text-foreground"
          aria-label="Renombrar"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => setConfirmDelFile(file)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
          aria-label="Eliminar"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <>
      <AppBar
        title="Archivos"
        subtitle={`${formatBytes(quota.used)} de ${formatBytes(quota.total)} · ${Math.round(usedPct)}%`}
        rightSlot={
          <div className="flex items-center gap-2">
            <button
              onClick={() => (selecting ? clearSelection() : setSelecting(true))}
              className="rounded-full glass-subtle px-3 py-1.5 text-xs font-medium hover:bg-glass"
            >
              {selecting ? "Cancelar" : "Seleccionar"}
            </button>
            <div
              className="ml-1 hidden h-1.5 w-24 overflow-hidden rounded-full bg-glass sm:block"
              aria-hidden
            >
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>
        }
      />

      {/* Mobile-only thin progress under app bar */}
      <div className="px-6 pt-2 sm:hidden">
        <div className="h-1 w-full overflow-hidden rounded-full bg-glass">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>

      {/* Tree root with drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverFolder("root");
        }}
        onDragLeave={() => setDragOverFolder((cur) => (cur === "root" ? null : cur))}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOverFolder(null);
          if (draggingFileId) {
            await moveFileToFolder(draggingFileId, null);
            setDraggingFileId(null);
          } else if (e.dataTransfer?.files?.length) {
            upload(e.dataTransfer.files, null);
          }
        }}
        className={`mx-3 mt-3 rounded-3xl border-2 border-dashed p-2 transition ${
          dragOverFolder === "root" ? "border-primary bg-glass" : "border-transparent"
        }`}
      >
        <div className="glass rounded-3xl p-2">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rootFolders.length === 0 && rootFiles.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-glass-strong">
                <Upload className="h-5 w-5" />
              </div>
              <p className="mt-3 font-medium">Carpeta vacía</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Arrastra archivos aquí o usa el botón <span className="text-foreground">+</span>.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {rootFolders.map((f) => (
                <FolderNode key={f.id} folder={f} depth={0} />
              ))}
              {rootFiles.map((file) => (
                <FileRowItem key={file.id} file={file} depth={0} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hidden device file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) upload(e.target.files, pendingUploadFolder);
          setPendingUploadFolder(null);
          e.target.value = "";
        }}
      />

      {/* Upload progress */}
      {uploading && (
        <div className="fixed bottom-28 left-1/2 z-40 -translate-x-1/2">
          <div className="glass-strong flex items-center gap-3 rounded-full px-5 py-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Subiendo… {progress}%
          </div>
        </div>
      )}

      {/* Floating action — root level */}
      <div className="fixed bottom-24 right-5 z-40 flex flex-col items-end gap-3">
        <button
          onClick={() => setShowNewFolder({ parent: null })}
          className="glass-strong flex h-12 w-12 items-center justify-center rounded-full text-foreground"
          aria-label="Nueva carpeta"
        >
          <FolderPlus className="h-5 w-5" />
        </button>
        <button
          onClick={() => {
            setPendingUploadFolder(null);
            setShowSourcePicker(true);
          }}
          className="flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-elevated transition active:scale-95"
          aria-label="Añadir archivo"
        >
          <Plus className="h-5 w-5" /> Añadir
        </button>
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
            ¿Eliminar la carpeta <span className="text-foreground font-medium">{confirmDelFolder?.name}</span>? Los archivos quedarán en Inicio.
          </>
        }
        destructive
        confirmLabel="Eliminar"
        onConfirm={async () => { if (confirmDelFolder) await deleteFolder(confirmDelFolder); }}
      />

      {/* Source picker */}
      {showSourcePicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setShowSourcePicker(false)} />
          <div className="glass-strong relative w-full max-w-sm rounded-3xl p-5 animate-slide-up">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Añadir archivo</h2>
              <button onClick={() => setShowSourcePicker(false)} className="rounded-full p-1.5 hover:bg-glass">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Elige una fuente.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => onPickFromDevice(pendingUploadFolder)}
                className="glass-subtle flex flex-col items-center gap-2 rounded-2xl p-5 text-center hover:bg-glass"
              >
                <HardDrive className="h-6 w-6" />
                <span className="text-sm font-medium">Dispositivo</span>
                <span className="text-xs text-muted-foreground">Archivos locales</span>
              </button>
              <button
                onClick={() => onPickFromInternal(pendingUploadFolder)}
                className="glass-subtle flex flex-col items-center gap-2 rounded-2xl p-5 text-center hover:bg-glass"
              >
                <Layers className="h-6 w-6" />
                <span className="text-sm font-medium">Eurekup</span>
                <span className="text-xs text-muted-foreground">Almacén interno</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Internal file picker */}
      {showInternalPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setShowInternalPicker(false)} />
          <div className="glass-strong relative flex max-h-[80dvh] w-full max-w-md flex-col rounded-3xl p-5 animate-slide-up">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Selecciona un archivo</h2>
              <button onClick={() => setShowInternalPicker(false)} className="rounded-full p-1.5 hover:bg-glass">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Se moverá a la carpeta seleccionada.
            </p>
            <div className="mt-4 -mx-1 flex-1 overflow-y-auto px-1">
              {files.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No tienes archivos aún.</p>
              ) : (
                <ul className="space-y-1">
                  {files.map((f) => {
                    const Icon = iconFor(f.mime_type);
                    return (
                      <li key={f.id}>
                        <button
                          onClick={() => copyFromInternal(f)}
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-glass"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-glass-strong">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{f.name}</p>
                            <p className="text-xs text-muted-foreground">{formatBytes(f.size_bytes)}</p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

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
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setShowNewFolder(null)} />
          <div className="glass-strong relative w-full max-w-sm rounded-3xl p-6 animate-slide-up">
            <h2 className="text-lg font-semibold">Nueva carpeta</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {showNewFolder.parent
                ? `Dentro de ${folders.find((f) => f.id === showNewFolder.parent)?.name ?? "carpeta"}`
                : "En Inicio"}
            </p>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createFolder()}
              placeholder="Nombre"
              className="mt-4 w-full rounded-2xl glass-subtle px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowNewFolder(null)} className="flex-1 rounded-full glass-subtle py-2.5 text-sm font-medium">
                Cancelar
              </button>
              <button onClick={createFolder} className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground">
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move file modal */}
      {moveTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setMoveTarget(null)} />
          <div className="glass-strong relative flex max-h-[80dvh] w-full max-w-md flex-col rounded-3xl p-5 animate-slide-up">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Mover archivo</h2>
              <button onClick={() => setMoveTarget(null)} className="rounded-full p-1.5 hover:bg-glass">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">{moveTarget.name}</p>
            <div className="mt-4 -mx-1 flex-1 overflow-y-auto px-1">
              <ul className="space-y-1">
                <li>
                  <button
                    onClick={async () => {
                      await moveFileToFolder(moveTarget.id, null);
                      setMoveTarget(null);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-glass"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-glass-strong">
                      <HardDrive className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">Inicio</p>
                      <p className="text-xs text-muted-foreground">Carpeta raíz</p>
                    </div>
                  </button>
                </li>
                {folders.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={async () => {
                        await moveFileToFolder(moveTarget.id, f.id);
                        setMoveTarget(null);
                      }}
                      disabled={moveTarget.folder_id === f.id}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-glass disabled:opacity-40"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-glass-strong">
                        <Folder className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{f.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{folderPath(f.id)}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
