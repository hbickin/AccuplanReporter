/* =========================================================================
   AccuplanReporter — RDL (SSRS) veri katmani, 2/2: hesap ve rapor uclari
   -------------------------------------------------------------------------
   Sablon (EminAsortiKesimhane) mantigi:
     PASTAL BOYU (m)    = MadeLength x 0,0254   (gerceklesen)
                          yoksa Σ(alan x asorti) / (kumas eni x verimlilik)
     F. PASTAL BOYU (m) = PASTAL BOYU + pastal payi (kumas EndLoss)
     TOPL. AD.          = IS ADETI x KAT x SERIM
     KUMAS SARF (m)     = F. PASTAL BOYU x KAT x SERIM
     TOPLAM KESIM       = Σ (asorti x kat x serim)
     KESIM FARKI        = TOPLAM KESIM - ISEMRI ADETI
   ========================================================================= */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* --- raporda gosterilecek bedenler (siparisi olan veya pastalda gecen) -- */
CREATE OR ALTER FUNCTION dbo.fn_AccuplanUsedSizes (@WorkOrderName nvarchar(200))
RETURNS TABLE
AS RETURN
    WITH used AS (
        SELECT SizeId FROM dbo.fn_AccuplanOrderQty(@WorkOrderName) WHERE Qty > 0
        UNION
        SELECT SizeId FROM dbo.fn_AccuplanAsorti(@WorkOrderName)   WHERE Qty > 0
    )
    SELECT s.SizeId, s.SizeLabel, SizeOrder = ROW_NUMBER() OVER (ORDER BY s.SizeId)
      FROM dbo.fn_AccuplanSizes(@WorkOrderName) AS s
     WHERE s.SizeId IN (SELECT SizeId FROM used);
GO

/* --- pastal satirlari (sablondaki 1..n. PASTAL satirlari) -------------- */
CREATE OR ALTER FUNCTION dbo.fn_AccuplanMarkerRows
(
    @WorkOrderName nvarchar(200),
    @PastalPayi    float = NULL   -- NULL: kumasin EndLoss degeri kullanilir
)
RETURNS TABLE
AS RETURN
    WITH asorti AS (
        SELECT a.PlanNo, a.MarkerIdx,
               Pieces      = SUM(a.Qty),
               AreaIn2     = SUM(a.Qty * ISNULL(m.AreaIn2, 0)),
               PerimeterIn = SUM(a.Qty * ISNULL(m.PerimeterIn, 0))
          FROM dbo.fn_AccuplanAsorti(@WorkOrderName) AS a
          LEFT JOIN dbo.fn_AccuplanMeasures(@WorkOrderName) AS m
                 ON m.PlanNo = a.PlanNo AND m.SizeId = a.SizeId
         GROUP BY a.PlanNo, a.MarkerIdx
    ),
    ham AS (
        SELECT
            b.PlanNo, b.MarkerIdx, b.SetIdx, b.OrderNumber, b.MarkerName, b.CustomName,
            b.LayLimits, b.IsApproved, b.Kat, b.Serim,
            p.FabricCode, p.FabricCodeList, p.Location, p.LayLimits AS PlanLayLimits,
            p.OrderSetName, p.SpreadMethod, p.CalculationDate,
            EnCm       = ROUND(p.WidthIn * 2.54, 2),
            PastalPayi = ISNULL(@PastalPayi, ROUND(p.EndLossIn * 0.0254, 4)),
            Pieces     = ISNULL(a.Pieces, 0),
            AreaIn2    = ISNULL(a.AreaIn2, 0),
            PerimeterIn= ISNULL(a.PerimeterIn, 0),
            WidthIn    = CASE WHEN ISNULL(b.MarkerWidthIn, 0) > 0 THEN b.MarkerWidthIn ELSE p.WidthIn END,
            /* gerceklesen verimlilik varsa o kullanilir */
            Verimlilik = CASE WHEN b.MadeUtil > 0 THEN b.MadeUtil ELSE b.Utilization END,
            PlanVerim  = b.Utilization,
            MadeUtil   = b.MadeUtil,
            MadeLengthIn = b.MadeLengthIn,
            p.CutSpeed, p.BundleRemove, p.SpreadSpeed, p.SpreadSetup, p.TurnTime
          FROM dbo.fn_AccuplanMarkerBase(@WorkOrderName) AS b
          JOIN dbo.fn_AccuplanPlans(@WorkOrderName)      AS p ON p.PlanNo = b.PlanNo
          LEFT JOIN asorti                               AS a ON a.PlanNo = b.PlanNo AND a.MarkerIdx = b.MarkerIdx
    ),
    boy AS (
        SELECT h.*,
               BoyKaynak = CASE WHEN h.MadeLengthIn > 0 THEN 'gerceklesen' ELSE 'hesap' END,
               LengthIn  = CASE
                              WHEN h.MadeLengthIn > 0 THEN h.MadeLengthIn
                              WHEN h.AreaIn2 > 0 AND h.WidthIn > 0 AND h.Verimlilik > 0
                                   THEN h.AreaIn2 / (h.WidthIn * h.Verimlilik)
                              ELSE NULL
                           END
          FROM ham AS h
    ),
    metre AS (
        /* once mm hassasiyetine yuvarlanir; turev degerler bu degerden uretilir */
        SELECT b.*, PastalBoyu = ROUND(b.LengthIn * 0.0254, 4) FROM boy AS b
    )
    SELECT
        m.PlanNo, m.MarkerIdx, m.SetIdx, m.OrderNumber,
        m.FabricCode, m.FabricCodeList, m.Location, m.OrderSetName, m.SpreadMethod,
        m.PlanLayLimits, m.CalculationDate, m.EnCm, m.PastalPayi,
        MarkerName  = ISNULL(NULLIF(m.CustomName, ''), m.MarkerName),
        m.LayLimits, m.IsApproved, m.BoyKaynak,
        IsAdeti     = m.Pieces,
        Kat         = m.Kat,
        Serim       = m.Serim,
        ToplamAdet  = m.Pieces * m.Kat * m.Serim,
        PastalBoyu  = m.PastalBoyu,
        FPastalBoyu = ROUND(m.PastalBoyu + m.PastalPayi, 4),
        BirimMetraj = CASE WHEN m.Pieces > 0 THEN m.PastalBoyu / m.Pieces END,
        KumasSarf   = ROUND(m.PastalBoyu + m.PastalPayi, 4) * m.Kat * m.Serim,
        Verimlilik  = m.Verimlilik,
        PlanVerim   = m.PlanVerim,
        SerimSuresi = CASE WHEN m.SpreadSpeed > 0 AND m.Kat > 0 AND m.LengthIn IS NOT NULL
                           THEN m.Serim * (m.SpreadSetup + m.Kat * (m.LengthIn / m.SpreadSpeed + m.TurnTime)) END,
        KesimSuresi = CASE WHEN m.CutSpeed > 0 AND m.PerimeterIn > 0
                           THEN m.Serim * (m.PerimeterIn / m.CutSpeed + m.Pieces * m.BundleRemove) END
      FROM metre AS m;
GO

/* --- rapor parametresi: is emri listesi --------------------------------
   Raporun "Ara" parametresi buraya @Search olarak gelir: kullanici yazdikca
   İŞEMRİ NO listesi suzulur (SSRS'te gercek autocomplete yoktur; standart
   cozum budur). Arama bosken en yeni @Top kayit listelenir, boylece binlerce
   is emri olan kurulumlarda acilir liste kullanilabilir kalir.              */
CREATE OR ALTER PROCEDURE dbo.usp_AccuplanWorkOrderList
    @Search nvarchar(200) = NULL,
    @Top    int           = 500
AS
BEGIN
    SET NOCOUNT ON;

    /* Rapor bos kutuyu bos metin olarak gonderebilir; NULL ile ayni sayilir. */
    SET @Search = NULLIF(LTRIM(RTRIM(@Search)), N'');

    SELECT TOP (@Top)
           w.id, w.name, w.number, w.created_on, w.status, w.models, w.fabric_codes,
           Etiket = w.name + CASE WHEN NULLIF(w.models, '') IS NULL THEN '' ELSE '  —  ' + w.models END
      FROM dbo.WorkOrder AS w
     WHERE @Search IS NULL
        OR w.name   LIKE '%' + @Search + '%'
        OR w.number LIKE '%' + @Search + '%'
        OR w.models LIKE '%' + @Search + '%'
     ORDER BY w.created_on DESC, w.id DESC;
END;
GO

/* --- rapor basligi ----------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_AccuplanReportHeader
    @WorkOrderName nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT h.*, PlanSayisi = (SELECT COUNT(DISTINCT PlanNo) FROM dbo.fn_AccuplanMarkerRows(@WorkOrderName, NULL))
      FROM dbo.fn_AccuplanHeader(@WorkOrderName) AS h;
END;
GO

/* --- KESIM sayfalari: matris veri kumesi -------------------------------
   Her hucre bir satirdir. SSRS tarafinda satir grubu = RowOrder/RowLabel,
   sutun grubu = SizeOrder/SizeLabel. Sagdaki hesap sutunlari satir basina
   tekrarlanir (Max(...) ile okunur).                                      */
CREATE OR ALTER PROCEDURE dbo.usp_AccuplanCutMatrix
    @WorkOrderName     nvarchar(200),
    @PastalPayi        float = NULL,
    @IncludeEmptyPlans bit   = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @rows TABLE (
        PlanNo int, MarkerIdx int, SetIdx int, OrderNumber int, MarkerName nvarchar(100),
        FabricCode nvarchar(50), Location nvarchar(100), OrderSetName nvarchar(100),
        SpreadMethod nvarchar(50), PlanLayLimits nvarchar(100), CalculationDate nvarchar(50),
        EnCm float, PastalPayi float, BoyKaynak nvarchar(20),
        IsAdeti float, Kat float, Serim float, ToplamAdet float,
        PastalBoyu float, FPastalBoyu float, BirimMetraj float, KumasSarf float,
        Verimlilik float, SerimSuresi float, KesimSuresi float);

    INSERT INTO @rows
    SELECT PlanNo, MarkerIdx, SetIdx, OrderNumber, MarkerName, FabricCode, Location, OrderSetName,
           SpreadMethod, PlanLayLimits, CalculationDate, EnCm, PastalPayi, BoyKaynak,
           IsAdeti, Kat, Serim, ToplamAdet, PastalBoyu, FPastalBoyu, BirimMetraj, KumasSarf,
           Verimlilik, SerimSuresi, KesimSuresi
      FROM dbo.fn_AccuplanMarkerRows(@WorkOrderName, @PastalPayi);

    /* raporlanacak planlar ve KESIM-1..n sayfa numaralari */
    DECLARE @plans TABLE (PlanNo int, PlanSeq int, FabricCode nvarchar(50), SheetName nvarchar(50),
                          EnCm float, PastalPayi float, Location nvarchar(100),
                          OrderSetName nvarchar(100), SpreadMethod nvarchar(50),
                          PlanLayLimits nvarchar(100), CalculationDate nvarchar(50));
    INSERT INTO @plans
    SELECT p.PlanNo,
           PlanSeq = ROW_NUMBER() OVER (ORDER BY p.PlanNo),
           p.FabricCode,
           SheetName = N'KESİM-' + CAST(ROW_NUMBER() OVER (ORDER BY p.PlanNo) AS nvarchar(10)),
           ROUND(p.WidthIn * 2.54, 2), ISNULL(@PastalPayi, ROUND(p.EndLossIn * 0.0254, 4)),
           p.Location, p.OrderSetName, p.SpreadMethod, p.LayLimits, p.CalculationDate
      FROM dbo.fn_AccuplanPlans(@WorkOrderName) AS p
     WHERE @IncludeEmptyPlans = 1
        OR EXISTS (SELECT 1 FROM @rows AS r WHERE r.PlanNo = p.PlanNo);

    DECLARE @siparis TABLE (PlanNo int, SizeId int, Qty float);
    INSERT INTO @siparis
    SELECT PlanNo, SizeId, SUM(Qty) FROM dbo.fn_AccuplanOrderQty(@WorkOrderName)
     GROUP BY PlanNo, SizeId;

    DECLARE @asorti TABLE (PlanNo int, MarkerIdx int, SizeId int, Qty float);
    INSERT INTO @asorti
    SELECT PlanNo, MarkerIdx, SizeId, SUM(Qty) FROM dbo.fn_AccuplanAsorti(@WorkOrderName)
     GROUP BY PlanNo, MarkerIdx, SizeId;

    WITH sizes AS (SELECT * FROM dbo.fn_AccuplanUsedSizes(@WorkOrderName)),
    /* plan bazli siparis toplami (BEDEN DAĞILIMI % icin) */
    siparisTop AS (SELECT PlanNo, Toplam = SUM(Qty) FROM @siparis GROUP BY PlanNo),
    /* plan bazli kesim adetleri (asorti x kat x serim) */
    kesim AS (
        SELECT a.PlanNo, a.SizeId, Adet = SUM(a.Qty * r.Kat * r.Serim)
          FROM @asorti AS a
          JOIN @rows   AS r ON r.PlanNo = a.PlanNo AND r.MarkerIdx = a.MarkerIdx
         GROUP BY a.PlanNo, a.SizeId
    ),
    planToplam AS (
        SELECT PlanNo,
               IsAdeti = SUM(IsAdeti), Kat = SUM(Kat * Serim), Serim = SUM(Serim),
               ToplamAdet = SUM(ToplamAdet), PastalBoyu = SUM(PastalBoyu),
               FPastalBoyu = SUM(FPastalBoyu), KumasSarf = SUM(KumasSarf),
               SerimSuresi = SUM(SerimSuresi), KesimSuresi = SUM(KesimSuresi),
               Verimlilik = CASE WHEN SUM(KumasSarf) > 0
                                 THEN SUM(KumasSarf * Verimlilik) / SUM(KumasSarf) END,
               BirimMetraj = CASE WHEN SUM(IsAdeti) > 0 THEN SUM(PastalBoyu) / SUM(IsAdeti) END
          FROM @rows GROUP BY PlanNo
    ),

    /* 0 = İŞEMRİ ADETİ ------------------------------------------------- */
    satirlar AS (
        SELECT p.PlanNo, p.PlanSeq, p.SheetName, p.FabricCode,
               RowOrder = 0, RowKind = 'ORDER', RowLabel = N'İŞEMRİ ADETİ',
               MarkerName = CAST(NULL AS nvarchar(100)), BoyKaynak = CAST(NULL AS nvarchar(20)),
               s.SizeId, s.SizeLabel, s.SizeOrder,
               CellValue = ISNULL(o.Qty, 0), CellFormat = 'N0',
               IsAdeti = st.Toplam, Kat = CAST(NULL AS float), Serim = CAST(NULL AS float),
               ToplamAdet = CAST(NULL AS float), PastalBoyu = CAST(NULL AS float),
               FPastalBoyu = CAST(NULL AS float), BirimMetraj = CAST(NULL AS float),
               KumasSarf = CAST(NULL AS float), Verimlilik = CAST(NULL AS float),
               SerimSuresi = CAST(NULL AS float), KesimSuresi = CAST(NULL AS float)
          FROM @plans AS p
         CROSS JOIN sizes AS s
          LEFT JOIN @siparis   AS o  ON o.PlanNo = p.PlanNo AND o.SizeId = s.SizeId
          LEFT JOIN siparisTop AS st ON st.PlanNo = p.PlanNo

        /* 1..n = PASTAL satirlari --------------------------------------- */
        UNION ALL
        SELECT p.PlanNo, p.PlanSeq, p.SheetName, p.FabricCode,
               RowOrder = ROW_NUMBER() OVER (PARTITION BY p.PlanNo, s.SizeId
                                             ORDER BY r.OrderNumber, r.MarkerIdx, r.SetIdx),
               RowKind = 'MARKER',
               RowLabel = CAST(ROW_NUMBER() OVER (PARTITION BY p.PlanNo, s.SizeId
                                                  ORDER BY r.OrderNumber, r.MarkerIdx, r.SetIdx) AS nvarchar(10)) + N'.PASTAL',
               r.MarkerName, r.BoyKaynak,
               s.SizeId, s.SizeLabel, s.SizeOrder,
               CellValue = a.Qty, CellFormat = 'N0',
               r.IsAdeti, r.Kat, r.Serim, r.ToplamAdet, r.PastalBoyu, r.FPastalBoyu,
               r.BirimMetraj, r.KumasSarf, r.Verimlilik, r.SerimSuresi, r.KesimSuresi
          FROM @plans AS p
          JOIN @rows  AS r ON r.PlanNo = p.PlanNo
         CROSS JOIN sizes AS s
          LEFT JOIN @asorti AS a ON a.PlanNo = r.PlanNo AND a.MarkerIdx = r.MarkerIdx AND a.SizeId = s.SizeId

        /* 90 = TOPLAM ASORTİ -------------------------------------------- */
        UNION ALL
        SELECT p.PlanNo, p.PlanSeq, p.SheetName, p.FabricCode,
               90, 'SUM_ASORTI', N'TOPLAM ASORTİ', NULL, NULL,
               s.SizeId, s.SizeLabel, s.SizeOrder,
               (SELECT SUM(a.Qty) FROM @asorti AS a
                 WHERE a.PlanNo = p.PlanNo AND a.SizeId = s.SizeId), 'N0',
               t.IsAdeti, t.Kat, t.Serim, t.ToplamAdet, t.PastalBoyu, t.FPastalBoyu,
               t.BirimMetraj, t.KumasSarf, t.Verimlilik, t.SerimSuresi, t.KesimSuresi
          FROM @plans AS p
         CROSS JOIN sizes AS s
          LEFT JOIN planToplam AS t ON t.PlanNo = p.PlanNo

        /* 91 = TOPLAM KESİM --------------------------------------------- */
        UNION ALL
        SELECT p.PlanNo, p.PlanSeq, p.SheetName, p.FabricCode,
               91, 'SUM_KESIM', N'TOPLAM KESİM', NULL, NULL,
               s.SizeId, s.SizeLabel, s.SizeOrder,
               ISNULL(k.Adet, 0), 'N0',
               NULL, NULL, NULL,
               (SELECT SUM(k2.Adet) FROM kesim AS k2 WHERE k2.PlanNo = p.PlanNo),
               NULL, NULL, NULL, NULL, NULL, NULL, NULL
          FROM @plans AS p
         CROSS JOIN sizes AS s
          LEFT JOIN kesim AS k ON k.PlanNo = p.PlanNo AND k.SizeId = s.SizeId

        /* 92 = KESİM FARKI ---------------------------------------------- */
        UNION ALL
        SELECT p.PlanNo, p.PlanSeq, p.SheetName, p.FabricCode,
               92, 'FARK', N'KESİM FARKI', NULL, NULL,
               s.SizeId, s.SizeLabel, s.SizeOrder,
               ISNULL(k.Adet, 0) - ISNULL(o.Qty, 0), 'N0',
               NULL, NULL, NULL,
               (SELECT SUM(k2.Adet) FROM kesim AS k2 WHERE k2.PlanNo = p.PlanNo)
                 - (SELECT SUM(o2.Qty) FROM @siparis AS o2 WHERE o2.PlanNo = p.PlanNo),
               NULL, NULL, NULL, NULL, NULL, NULL, NULL
          FROM @plans AS p
         CROSS JOIN sizes AS s
          LEFT JOIN kesim    AS k ON k.PlanNo = p.PlanNo AND k.SizeId = s.SizeId
          LEFT JOIN @siparis AS o ON o.PlanNo = p.PlanNo AND o.SizeId = s.SizeId

        /* 93 = BEDEN DAĞILIMI % ----------------------------------------- */
        UNION ALL
        SELECT p.PlanNo, p.PlanSeq, p.SheetName, p.FabricCode,
               93, 'DAGILIM', N'BEDEN DAĞILIMI %', NULL, NULL,
               s.SizeId, s.SizeLabel, s.SizeOrder,
               CASE WHEN st.Toplam > 0 THEN ISNULL(o.Qty, 0) / st.Toplam ELSE 0 END, 'P1',
               NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
          FROM @plans AS p
         CROSS JOIN sizes AS s
          LEFT JOIN @siparis   AS o  ON o.PlanNo = p.PlanNo AND o.SizeId = s.SizeId
          LEFT JOIN siparisTop AS st ON st.PlanNo = p.PlanNo
    )
    SELECT sl.*, pl.EnCm, pl.PastalPayi, pl.Location, pl.OrderSetName,
           pl.SpreadMethod, pl.PlanLayLimits, pl.CalculationDate
      FROM satirlar AS sl
      JOIN @plans   AS pl ON pl.PlanNo = sl.PlanNo
     ORDER BY sl.PlanSeq, sl.RowOrder, sl.SizeOrder;
END;
GO

/* --- ÖZET sayfasi ------------------------------------------------------ */
CREATE OR ALTER PROCEDURE dbo.usp_AccuplanSummary
    @WorkOrderName     nvarchar(200),
    @PastalPayi        float = NULL,
    @IncludeEmptyPlans bit   = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @rows TABLE (PlanNo int, MarkerIdx int, FabricCode nvarchar(50),
                         IsAdeti float, Kat float, Serim float, ToplamAdet float,
                         KumasSarf float, Verimlilik float, SerimSuresi float, KesimSuresi float);
    INSERT INTO @rows
    SELECT PlanNo, MarkerIdx, FabricCode, IsAdeti, Kat, Serim, ToplamAdet,
           KumasSarf, Verimlilik, SerimSuresi, KesimSuresi
      FROM dbo.fn_AccuplanMarkerRows(@WorkOrderName, @PastalPayi);

    SELECT
        PlanSeq     = ROW_NUMBER() OVER (ORDER BY r.PlanNo),
        SheetName   = N'KESİM-' + CAST(ROW_NUMBER() OVER (ORDER BY r.PlanNo) AS nvarchar(10)),
        r.PlanNo,
        FabricCode  = MAX(r.FabricCode),
        PastalSayisi= COUNT(*),
        ToplamKat   = SUM(r.Kat * r.Serim),
        ToplamSerim = SUM(r.Serim),
        KesimAdedi  = SUM(r.ToplamAdet),
        KumasSarf   = SUM(r.KumasSarf),
        Verimlilik  = CASE WHEN SUM(r.KumasSarf) > 0
                           THEN SUM(r.KumasSarf * r.Verimlilik) / SUM(r.KumasSarf) END,
        SerimSuresi = SUM(r.SerimSuresi),
        KesimSuresi = SUM(r.KesimSuresi)
      FROM @rows AS r
     GROUP BY r.PlanNo
     ORDER BY r.PlanNo;
END;
GO

/* --- ÖZET: beden dagilimi --------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_AccuplanSizeDistribution
    @WorkOrderName nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    /* siparis adetleri tum planlarda ayni oldugu icin ilk plan esas alinir */
    DECLARE @plan int = (SELECT MIN(PlanNo) FROM dbo.fn_AccuplanOrderQty(@WorkOrderName));
    DECLARE @toplam float =
        (SELECT SUM(Qty) FROM dbo.fn_AccuplanOrderQty(@WorkOrderName) WHERE PlanNo = @plan);

    SELECT s.SizeId, s.SizeLabel, s.SizeOrder,
           Adet   = ISNULL(SUM(o.Qty), 0),
           Toplam = @toplam,
           Oran   = CASE WHEN @toplam > 0 THEN ISNULL(SUM(o.Qty), 0) / @toplam ELSE 0 END
      FROM dbo.fn_AccuplanUsedSizes(@WorkOrderName) AS s
      LEFT JOIN dbo.fn_AccuplanOrderQty(@WorkOrderName) AS o
             ON o.SizeId = s.SizeId AND o.PlanNo = @plan
     GROUP BY s.SizeId, s.SizeLabel, s.SizeOrder
     ORDER BY s.SizeOrder;
END;
GO
