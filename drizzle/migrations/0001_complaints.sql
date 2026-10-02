CREATE TABLE IF NOT EXISTS public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  email text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaints TO authenticated;
--> statement-breakpoint
GRANT ALL ON public.complaints TO service_role;
--> statement-breakpoint
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "user insert complaint" ON public.complaints FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "admin read complaints" ON public.complaints FOR SELECT TO authenticated USING (public.is_admin() OR auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "admin update complaints" ON public.complaints FOR UPDATE TO authenticated USING (public.is_admin());
--> statement-breakpoint
CREATE POLICY "admin delete complaints" ON public.complaints FOR DELETE TO authenticated USING (public.is_admin());
