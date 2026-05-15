-- P0 additive schema for the dashboard.
-- Safe to run on an existing project: no DROP, no destructive rename.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.projects (
  id text PRIMARY KEY,
  name text NOT NULL,
  pillar text NOT NULL DEFAULT 'untriaged',
  done_definition text,
  status text NOT NULL DEFAULT 'active',
  start_date date,
  due_date date,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  pillar text NOT NULL DEFAULT 'untriaged',
  project_id text REFERENCES public.projects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'inbox',
  due_date date,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.missions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  client text,
  entity text,
  contact text,
  quote_sent boolean DEFAULT false,
  quote_accepted boolean DEFAULT false,
  price numeric DEFAULT 0,
  debours numeric DEFAULT 0,
  date_validation date,
  date_payment date,
  status text DEFAULT 'pas_commence',
  notes text,
  project_id text REFERENCES public.projects(id) ON DELETE SET NULL,
  external_ref text,
  qonto_id text,
  bank_label text,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS pillar text DEFAULT 'untriaged',
  ADD COLUMN IF NOT EXISTS done_definition text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now());

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS pillar text DEFAULT 'untriaged',
  ADD COLUMN IF NOT EXISTS project_id text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now());

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS client text,
  ADD COLUMN IF NOT EXISTS entity text,
  ADD COLUMN IF NOT EXISTS contact text,
  ADD COLUMN IF NOT EXISTS quote_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS quote_accepted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS date_validation date,
  ADD COLUMN IF NOT EXISTS date_payment date,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pas_commence',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS external_ref text,
  ADD COLUMN IF NOT EXISTS qonto_id text,
  ADD COLUMN IF NOT EXISTS bank_label text,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now());

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_missions_user_id ON public.missions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_missions_qonto_id_unique
  ON public.missions(qonto_id)
  WHERE qonto_id IS NOT NULL;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projects'
      AND policyname = 'Users can manage their own projects'
  ) THEN
    CREATE POLICY "Users can manage their own projects"
    ON public.projects
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tasks'
      AND policyname = 'Users can manage their own tasks'
  ) THEN
    CREATE POLICY "Users can manage their own tasks"
    ON public.tasks
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'missions'
      AND policyname = 'Users can manage their own missions'
  ) THEN
    CREATE POLICY "Users can manage their own missions"
    ON public.missions
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
