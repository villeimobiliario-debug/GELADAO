-- GELADAO: campos para Pix QR Code estatico no PDV Balcao.
-- A chave e os dados do recebedor sao configurados apenas pelo administrador
-- usando as politicas RLS ja existentes em public.app_settings.
ALTER TABLE public.app_settings
 ADD COLUMN IF NOT EXISTS pix_key text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS pix_receiver text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS pix_city text NOT NULL DEFAULT '';
