-- Colonnes fichier sur la table sources (pour type = 'document')
alter table sources add column if not exists file_path         text;
alter table sources add column if not exists file_type         text;
alter table sources add column if not exists file_mime         text;
alter table sources add column if not exists file_size         bigint;
alter table sources add column if not exists file_display_type text;

-- Bucket Supabase Storage pour les documents sources
insert into storage.buckets (id, name, public)
values ('source-documents', 'source-documents', true)
on conflict (id) do nothing;

-- Politique : tout le monde peut lire (documents publics pour les agents)
create policy "Public read source-documents"
  on storage.objects for select
  using (bucket_id = 'source-documents');

-- Politique : seul le service_role peut insérer/supprimer
create policy "Service role insert source-documents"
  on storage.objects for insert
  with check (bucket_id = 'source-documents');

create policy "Service role delete source-documents"
  on storage.objects for delete
  using (bucket_id = 'source-documents');
