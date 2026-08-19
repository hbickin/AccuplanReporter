/* =========================================================================
   AccuplanReporter — RDL veri katmani dogrulama betigi
   -------------------------------------------------------------------------
   Kurulumdan sonra bu betigi calistirip sonuclarin Accuplan ekranindaki
   degerlerle ortustugunu kontrol edin.
   ========================================================================= */
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO

DECLARE @WorkOrderName nvarchar(200) = N'IFS9599-DK';   -- kontrol edilecek is emri

PRINT '=== 1. Is emri basligi (Turkce karakter kontrolu dahil) ===';
SELECT WorkOrderNumber, CompanyName, ModelName, CutPlanManager, DateReceived
  FROM dbo.fn_AccuplanHeader(@WorkOrderName);

PRINT '=== 2. Kumas planlari — en (cm) ve pastal payi (m) ===';
SELECT PlanNo, FabricCode, EnCm = ROUND(WidthIn * 2.54, 2),
       PastalPayiM = ROUND(EndLossIn * 0.0254, 4), Location
  FROM dbo.fn_AccuplanPlans(@WorkOrderName);

PRINT '=== 3. Pastal satirlari ===';
SELECT FabricCode, MarkerName, BoyKaynak, IsAdeti, Kat, Serim, ToplamAdet,
       PastalBoyu, FPastalBoyu, KumasSarf = ROUND(KumasSarf, 2), Verimlilik,
       SerimSuresiDk = ROUND(SerimSuresi, 1), KesimSuresiDk = ROUND(KesimSuresi, 1)
  FROM dbo.fn_AccuplanMarkerRows(@WorkOrderName, NULL)
 ORDER BY PlanNo, OrderNumber, SetIdx;

PRINT '=== 4. OZET ===';
EXEC dbo.usp_AccuplanSummary @WorkOrderName;

PRINT '=== 5. KESIM FARKI kontrolu (bos gelmesi beklenir) ===';
/* Kesim adetleri is emri asortisini karsiliyorsa fark satirlarinin tamami 0 olur.
   Sifirdan farkli satirlar burada listelenir. */
DECLARE @m TABLE (PlanNo int, PlanSeq int, SheetName nvarchar(50), FabricCode nvarchar(50),
    RowOrder int, RowKind varchar(20), RowLabel nvarchar(50), MarkerName nvarchar(100),
    BoyKaynak nvarchar(20), SizeId int, SizeLabel nvarchar(20), SizeOrder int,
    CellValue float, CellFormat varchar(10), IsAdeti float, Kat float, Serim float,
    ToplamAdet float, PastalBoyu float, FPastalBoyu float, BirimMetraj float, KumasSarf float,
    Verimlilik float, SerimSuresi float, KesimSuresi float, EnCm float, PastalPayi float,
    Location nvarchar(100), OrderSetName nvarchar(100), SpreadMethod nvarchar(50),
    PlanLayLimits nvarchar(100), CalculationDate nvarchar(50));
INSERT INTO @m EXEC dbo.usp_AccuplanCutMatrix @WorkOrderName, NULL, 0;

SELECT SheetName, FabricCode, SizeLabel, Fark = CellValue
  FROM @m WHERE RowKind = 'FARK' AND CellValue <> 0
 ORDER BY SheetName, SizeOrder;

PRINT '=== 6. Matris ozeti (sayfa / satir / hucre) ===';
SELECT SheetName, FabricCode,
       PastalSatiri = COUNT(DISTINCT CASE WHEN RowKind = 'MARKER' THEN RowOrder END),
       ToplamSatir  = COUNT(DISTINCT RowOrder),
       BedenSayisi  = COUNT(DISTINCT SizeId),
       Hucre        = COUNT(*)
  FROM @m GROUP BY SheetName, FabricCode ORDER BY SheetName;
GO
