-- ============================================================================
-- 011_credential_sent_at · trackeo de credenciales enviadas por usuario
-- ============================================================================
-- Nueva columna users.credential_sent_at TIMESTAMPTZ NULL.
-- Cuando es NULL: nunca se envió credencial (o el usuario no tiene email).
-- Cuando tiene timestamp: la última vez que se mandó la credencial OK.
--
-- Backfill:
--  (a) Pre-existentes con email creados antes del bulk import del 2026-05-20:
--      asumimos que recibieron credencial al momento de creación (POST /api/users
--      autoenvía).
--  (b) Los 200 códigos enviados exitosamente vía bulk-send hoy.
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS credential_sent_at TIMESTAMPTZ NULL;

-- (a) Pre-existentes con email — asumimos enviada al crear.
UPDATE users
   SET credential_sent_at = created_at
 WHERE credential_sent_at IS NULL
   AND email IS NOT NULL AND email != ''
   AND created_at < TIMESTAMPTZ '2026-05-20 19:00:00 UTC';

-- (b) Los 200 códigos específicos enviados hoy vía bulk-send.
WITH sent(code) AS (VALUES ('CCB-89ZWK6'), ('CCB-8LALBE'), ('CCB-8RNQF2'), ('CCB-91OZ76'), ('CCB-95WZKL'), ('CCB-987V9W'), ('CCB-9D7EZS'), ('CCB-9LUKNE'), ('CCB-9T4D31'), ('CCB-A4RJNW'), ('CCB-AFKPDE'), ('CCB-AOROP1'), ('CCB-AT0IUV'), ('CCB-AWE15F'), ('CCB-B07IVY'), ('CCB-B3DA4B'), ('CCB-B8JASS'), ('CCB-BC35V5'), ('CCB-BG6ZVL'), ('CCB-BN1DCF'), ('CCB-BRQ0XU'), ('CCB-BVK6JW'), ('CCB-BZXN2O'), ('CCB-C2AW2Y'), ('CCB-C6KDEI'), ('CCB-CCF1JU'), ('CCB-CJ05O5'), ('CCB-CNN5E9'), ('CCB-CVXYQD'), ('CCB-CYYW7V'), ('CCB-D2YWZP'), ('CCB-D8RTT3'), ('CCB-DCTG8Y'), ('CCB-DGQU6Z'), ('CCB-DMKDK3'), ('CCB-DPY7RZ'), ('CCB-DSUA4A'), ('CCB-DVY1Y5'), ('CCB-E1568E'), ('CCB-E6JSN8'), ('CCB-EAX3OD'), ('CCB-ED5902'), ('CCB-EI867C'), ('CCB-EMU7KR'), ('CCB-EQOO2H'), ('CCB-EVB5IU'), ('CCB-F0RIA5'), ('CCB-F3JAK4'), ('CCB-F8YT2W'), ('CCB-FDVP03'), ('CCB-FGX6GW'), ('CCB-FJ8QZN'), ('CCB-FMBDHR'), ('CCB-FP38YN'), ('CCB-FT4HQ0'), ('CCB-FXBFPI'), ('CCB-G2O7IN'), ('CCB-G6E03B'), ('CCB-GB41SY'), ('CCB-GFIVJQ'), ('CCB-GKHH35'), ('CCB-GNYLRS'), ('CCB-GS3GBT'), ('CCB-GWIBHK'), ('CCB-H090G5'), ('CCB-H3I3IU'), ('CCB-H8ZMAO'), ('CCB-HBR6TC'), ('CCB-HFJIBJ'), ('CCB-HK5ASV'), ('CCB-HOFX6Y'), ('CCB-HS29OC'), ('CCB-HYU5WJ'), ('CCB-I2Z90Q'), ('CCB-I5RPUB'), ('CCB-IFF9H6'), ('CCB-IO4F95'), ('CCB-J3LVBW'), ('CCB-JATM4V'), ('CCB-JD7MSY'), ('CCB-JHW6R5'), ('CCB-JMZQB3'), ('CCB-JQ40F9'), ('CCB-JVBR2H'), ('CCB-JZHT3T'), ('CCB-K2RQ7I'), ('CCB-K51B4C'), ('CCB-K93Y0D'), ('CCB-KDV3EO'), ('CCB-KFDHI7'), ('CCB-KK9MVB'), ('CCB-KPUYRH'), ('CCB-KVT8O4'), ('CCB-L1ORE8'), ('CCB-L4VO54'), ('CCB-L7MD2X'), ('CCB-LBB4ET'), ('CCB-LFRD94'), ('CCB-LKND0Y'), ('CCB-LN8DNK'), ('CCB-LQ3N2Q'), ('CCB-LUL7TE'), ('CCB-M0SFOD'), ('CCB-M597FM'), ('CCB-M88RH3'), ('CCB-MBIBI8'), ('CCB-MFJYEY'), ('CCB-MIX28Y'), ('CCB-MN1OE8'), ('CCB-MTO9IG'), ('CCB-MXVUPE'), ('CCB-N1WIU0'), ('CCB-N8VS6Z'), ('CCB-NCIW4Q'), ('CCB-NGP8E5'), ('CCB-NJYU9X'), ('CCB-NN1JPJ'), ('CCB-NRYIIM'), ('CCB-NVTZSV'), ('CCB-O083TE'), ('CCB-O58H67'), ('CCB-ODU392'), ('CCB-OG2R8W'), ('CCB-OKMAO0'), ('CCB-OOT65U'), ('CCB-ORF115'), ('CCB-OV1C2X'), ('CCB-OYBCSC'), ('CCB-P163P4'), ('CCB-P5KE6W'), ('CCB-PDMH3S'), ('CCB-PHRY5O'), ('CCB-PM1D3X'), ('CCB-PUHXL4'), ('CCB-PYF2KY'), ('CCB-Q2EA9P'), ('CCB-Q6DJ7Y'), ('CCB-Q9JWPH'), ('CCB-QCBOWX'), ('CCB-QJ243D'), ('CCB-QMD94G'), ('CCB-QP2LXG'), ('CCB-QSJ7A7'), ('CCB-QUFD2I'), ('CCB-QYW7LA'), ('CCB-R1I6QM'), ('CCB-R9EC0R'), ('CCB-RCQSDM'), ('CCB-RE3JVM'), ('CCB-RHOB3A'), ('CCB-RK6I5Y'), ('CCB-RQ8GN5'), ('CCB-RU50FU'), ('CCB-RZPZK8'), ('CCB-S4KN4O'), ('CCB-S78HSC'), ('CCB-SA5Q7E'), ('CCB-SD751M'), ('CCB-SGGE3D'), ('CCB-SJ0KM0'), ('CCB-SM0MD8'), ('CCB-SPV7TJ'), ('CCB-ST4F66'), ('CCB-SY20Q6'), ('CCB-T3DBZ3'), ('CCB-T7H8E7'), ('CCB-TBARNE'), ('CCB-TF0EHP'), ('CCB-TLYFPN'), ('CCB-TSPXEJ'), ('CCB-U07MTJ'), ('CCB-U5SAYD'), ('CCB-UA4EOU'), ('CCB-UD84B9'), ('CCB-UKGI0N'), ('CCB-UO1RTY'), ('CCB-UUYMHS'), ('CCB-UXAGFE'), ('CCB-V0RZ8N'), ('CCB-V8PGBC'), ('CCB-VBJ9E3'), ('CCB-VE652V'), ('CCB-VJO9K5'), ('CCB-VOPCSA'), ('CCB-VS0E0R'), ('CCB-VUX9FL'), ('CCB-VYQSDK'), ('CCB-W1OCI1'), ('CCB-W4Q0O8'), ('CCB-W7A0X1'), ('CCB-WCPUMP'), ('CCB-WHMD0W'), ('CCB-WKZ4EE'), ('CCB-WNV2QJ'), ('CCB-WQ1XZV'), ('CCB-WTPHGK'), ('CCB-WWVCH1'), ('CCB-X1PJVS'), ('CCB-X6WNFA'), ('CCB-XBOM4A'))
UPDATE users u
   SET credential_sent_at = NOW()
  FROM sent s
 WHERE u.code = s.code
   AND u.credential_sent_at IS NULL;
