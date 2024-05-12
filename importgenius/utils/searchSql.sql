

 SELECT *
FROM import_data.importgenius
WHERE JSON_CONTAINS_PATH(raw, 'all', '$.shipments[*].ProductDescription[*]')
AND (
    JSON_SEARCH(raw, 'one', '%HARDWARE%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%DOOR%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%DOOR PART%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%DOORPART%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%HANDLE%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%STEEL%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%STAINLESS%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%STEELTUBE%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%KNOB%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%WHEEL%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%HANGINGWHEEL%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%HANGING-WHEEL%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%BATHROOM%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%SLIDING%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%ACCESSORIES%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%FITTING%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%GLASS%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%GLASS DOOR%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%GLASS CLAMP%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%CLAMP%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%FLOOR%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%FLOORSPRING%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%FLOOR-SPRING%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%83024100%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%SPARE PARTS OF GLASS%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%SHOWER%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%SHOWER CURTAIN%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%SHOWER SEAL%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%SHOWER DOOR WHOLE SET KITS%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%PULL HANDLE%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%PULLHANDLE%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%83024200%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%PIPETUBE%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%PIPE TUBE%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%HINGE%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%SHOWER HINGE%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%830210%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%830241604545%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%83024100%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%SPARE PARTS OF GLASS%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%73089000%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%830242%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%830241%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%HANDRAIL%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%PLASTIC%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%METAL%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
    OR JSON_SEARCH(raw, 'one', '%BRASS%', NULL, '$.shipments[*].ProductDescription') IS NOT NULL
)