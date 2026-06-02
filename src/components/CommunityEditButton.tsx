import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Pencil } from 'lucide-react';

interface Props {
  songSlug: string;
  createdBy?: string;
}

export default function CommunityEditButton({ songSlug, createdBy }: Props) {
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    if (!supabase || !createdBy) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.id === createdBy) setCanEdit(true);
    });
  }, [createdBy]);

  if (!canEdit) return null;

  return (
    <a
      href={`/songs/new/?edit=${songSlug}`}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors hover:border-primary/40"
    >
      <Pencil className="w-3.5 h-3.5" />
      Edit song
    </a>
  );
}
