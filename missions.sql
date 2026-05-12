-- À exécuter dans le SQL Editor de votre Supabase

CREATE TABLE public.missions (
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
  status text DEFAULT 'pas_commence', -- pas_commence, en_cours, bloque, terminee, payee
  notes text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Activation de la sécurité RLS
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

-- Politique pour que l'utilisateur ne puisse voir et modifier que SES missions
CREATE POLICY "Users can manage their own missions" 
ON public.missions 
FOR ALL 
USING (auth.uid() = user_id);
