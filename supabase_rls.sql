-- 1. Enable Row Level Security on the 'draws' table
ALTER TABLE public.draws ENABLE ROW LEVEL SECURITY;

-- 2. Create a policy to allow anyone to READ data (needed to view results)
-- This allows the application to fetch draw data using the slug.
CREATE POLICY "Enable read access for all users"
ON public.draws
FOR SELECT
TO public
USING (true);

-- 3. Create a policy to allow anyone to INSERT data (needed to create new draws)
-- This allows the application to save new draws.
CREATE POLICY "Enable insert access for all users"
ON public.draws
FOR INSERT
TO public
WITH CHECK (true);

-- Optional: If you want to allow updates (e.g., if you plan to edit draws later), you might need an UPDATE policy.
-- For now, based on the code, only INSERT and SELECT are used.
