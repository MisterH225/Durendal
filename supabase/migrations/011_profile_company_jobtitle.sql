-- Ajoute les champs entreprise et fonction au profil utilisateur
-- Pour les utilisateurs qui n'appartiennent pas à une organisation
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS job_title text;
