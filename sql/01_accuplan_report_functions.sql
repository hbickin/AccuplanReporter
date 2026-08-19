/* =========================================================================
   AccuplanReporter — RDL (SSRS) veri katmani, 1/2: ayristirma fonksiyonlari
   -------------------------------------------------------------------------
   [Accuplan].[dbo].[WorkOrder].[document] alanindaki XML'i rapor icin
   iliskisel hale getirir.

   ONEMLI: document alani varbinary(max) ve icerigi UTF-8'dir.
     CAST(document AS VARCHAR(MAX))  -> Turkce karakterler bozulur (SÄ°NOP)
     CAST(document AS XML)           -> dogru sonuc verir (SİNOP)
   Bu yuzden her yerde dogrudan XML'e cevriliyor.

   Olculer Accuplan tarafinda inch'tir; fonksiyonlar metre/cm'e cevirir.
   ========================================================================= */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* --- is emri dokumani ------------------------------------------------- */
CREATE OR ALTER FUNCTION dbo.fn_AccuplanDoc (@WorkOrderName nvarchar(200))
RETURNS TABLE
AS RETURN
    SELECT TOP (1) w.id AS WorkOrderId, w.name AS WorkOrderName, CAST(w.document AS XML) AS doc
      FROM dbo.WorkOrder AS w
     WHERE w.name = @WorkOrderName
     ORDER BY w.id DESC;
GO

/* --- is emri basligi --------------------------------------------------- */
CREATE OR ALTER FUNCTION dbo.fn_AccuplanHeader (@WorkOrderName nvarchar(200))
RETURNS TABLE
AS RETURN
    SELECT
        d.WorkOrderId,
        WorkOrderNumber = d.doc.value('(/WorkOrder/Information/WorkOrderNumber)[1]', 'nvarchar(100)'),
        CompanyName     = d.doc.value('(/WorkOrder/Information/CompanyName)[1]',     'nvarchar(200)'),
        CutPlanManager  = d.doc.value('(/WorkOrder/Information/CutPlanManager)[1]',  'nvarchar(200)'),
        ModelName       = d.doc.value('(/WorkOrder/Models/Model/@Name)[1]',          'nvarchar(200)'),
        BaseSize        = d.doc.value('(/WorkOrder/Models/Model/@BaseSize)[1]',      'nvarchar(50)'),
        AreaName        = d.doc.value('(/WorkOrder/Models/@Area)[1]',                'nvarchar(100)'),
        DateReceivedText= d.doc.value('(/WorkOrder/Information/DateReceived)[1]',    'nvarchar(50)'),
        /* Accuplan tarihi MM/dd/yyyy HH:mm:ss bicimindedir (kultur 101) */
        DateReceived    = TRY_CONVERT(datetime, d.doc.value('(/WorkOrder/Information/DateReceived)[1]', 'nvarchar(50)'), 101),
        Comments        = d.doc.value('(/WorkOrder/Information/Comments)[1]',        'nvarchar(max)'),
        Description     = d.doc.value('(/WorkOrder/Information/Description)[1]',     'nvarchar(max)')
      FROM dbo.fn_AccuplanDoc(@WorkOrderName) AS d;
GO

/* --- beden listesi ----------------------------------------------------- */
CREATE OR ALTER FUNCTION dbo.fn_AccuplanSizes (@WorkOrderName nvarchar(200))
RETURNS TABLE
AS RETURN
    SELECT
        SizeId    = s.n.value('@Id', 'int'),
        SizeLabel = s.n.value('.', 'nvarchar(20)')
      FROM dbo.fn_AccuplanDoc(@WorkOrderName) AS d
     CROSS APPLY d.doc.nodes('/WorkOrder/Models/Model[1]/SizeLine/Size') AS s(n);
GO

/* --- kesim planlari (her kumas bir plan) ------------------------------- */
CREATE OR ALTER FUNCTION dbo.fn_AccuplanPlans (@WorkOrderName nvarchar(200))
RETURNS TABLE
AS RETURN
    SELECT
        /* dokumandaki sira: kardes dugumler arasindaki konum */
        PlanNo         = p.n.value('for $i in . return count(../*[. << $i]) + 1', 'int'),
        FabricCode     = p.n.value('(FabricCodes/Code)[1]', 'nvarchar(50)'),
        /* birden fazla kumas kodu olan planlar icin: CP/CZ bicimi
           (SQL Server XQuery'de string-join yok, concat dongusu kullaniliyor) */
        FabricCodeList = STUFF(p.n.query('for $c in FabricCodes/Code return concat("/", string($c))')
                                  .value('.', 'nvarchar(200)'), 1, 1, ''),
        IsIncluded     = CASE WHEN p.n.value('(@IsIncluded)[1]', 'nvarchar(10)') = 'false' THEN 0 ELSE 1 END,
        WidthIn        = ISNULL(p.n.value('(Fabric/@Width)[1]',   'float'), 0),
        EndLossIn      = ISNULL(p.n.value('(Fabric/@EndLoss)[1]', 'float'), 0),
        SpreadMethod   = p.n.value('(SpreadSettings/SpreadingMethod)[1]', 'nvarchar(50)'),
        Location       = p.n.value('(SpreadSettings/Location)[1]',        'nvarchar(100)'),
        OrderSetName   = p.n.value('(OrderSettings/@Name)[1]',            'nvarchar(100)'),
        LayLimits      = p.n.value('(OrderSettings/LayLimits)[1]',        'nvarchar(100)'),
        Annotation     = p.n.value('(OrderSettings/Annotation)[1]',       'nvarchar(100)'),
        CalculationDate= p.n.value('(ProductionSteps/CalculationDate)[1]','nvarchar(50)'),
        /* maliyet ayarlari: sure tahminleri icin (inch/dk, dk) */
        CutSpeed       = ISNULL(p.n.value('(CostSettings/CuttingCutSpeed)[1]',           'float'), 0),
        BundleRemove   = ISNULL(p.n.value('(CostSettings/CuttingTimeToRemoveBundle)[1]', 'float'), 0),
        SpreadSpeed    = ISNULL(p.n.value('(CostSettings/SpreadingSpreadSpeed)[1]',      'float'), 0),
        SpreadSetup    = ISNULL(p.n.value('(CostSettings/SpreadingSpreadSetupTime)[1]',  'float'), 0),
        TurnTime       = ISNULL(p.n.value('(CostSettings/SpreadingTurnTime)[1]',         'float'), 0)
      FROM dbo.fn_AccuplanDoc(@WorkOrderName) AS d
     CROSS APPLY d.doc.nodes('/WorkOrder/CutPlans/CutPlan') AS p(n);
GO

/* --- is emri adetleri (plan x beden) ----------------------------------- */
CREATE OR ALTER FUNCTION dbo.fn_AccuplanOrderQty (@WorkOrderName nvarchar(200))
RETURNS TABLE
AS RETURN
    SELECT
        PlanNo   = p.n.value('for $i in . return count(../*[. << $i]) + 1', 'int'),
        ColorName= c.n.value('(@Name)[1]', 'nvarchar(100)'),
        SizeId   = b.n.value('(@SizeId)[1]', 'int'),
        Qty      = ISNULL(b.n.value('(@Quantity)[1]', 'float'), 0)
      FROM dbo.fn_AccuplanDoc(@WorkOrderName) AS d
     CROSS APPLY d.doc.nodes('/WorkOrder/CutPlans/CutPlan') AS p(n)
     CROSS APPLY p.n.nodes('Input/Color') AS c(n)
     CROSS APPLY c.n.nodes('Bundle') AS b(n);
GO

/* --- parca olculeri (plan x beden): alan ve cevre, inch --------------- */
CREATE OR ALTER FUNCTION dbo.fn_AccuplanMeasures (@WorkOrderName nvarchar(200))
RETURNS TABLE
AS RETURN
    SELECT
        PlanNo      = p.n.value('for $i in . return count(../*[. << $i]) + 1', 'int'),
        SizeId      = b.n.value('(@SizeId)[1]', 'int'),
        AreaIn2     = ISNULL(b.n.value('(@Area)[1]',      'float'), 0),
        PerimeterIn = ISNULL(b.n.value('(@Perimeter)[1]', 'float'), 0)
      FROM dbo.fn_AccuplanDoc(@WorkOrderName) AS d
     CROSS APPLY d.doc.nodes('/WorkOrder/CutPlans/CutPlan') AS p(n)
     CROSS APPLY p.n.nodes('Input/BundleMeasures/Bundle') AS b(n);
GO

/* --- pastal asortisi (plan x pastal x beden) --------------------------- */
CREATE OR ALTER FUNCTION dbo.fn_AccuplanAsorti (@WorkOrderName nvarchar(200))
RETURNS TABLE
AS RETURN
    SELECT
        PlanNo    = p.n.value('for $i in . return count(../*[. << $i]) + 1', 'int'),
        MarkerIdx = m.n.value('for $i in . return count(../*[. << $i]) + 1', 'int'),
        SizeId    = b.n.value('(@SizeId)[1]', 'int'),
        Qty       = ISNULL(b.n.value('(@Quantity)[1]', 'float'), 0)
      FROM dbo.fn_AccuplanDoc(@WorkOrderName) AS d
     CROSS APPLY d.doc.nodes('/WorkOrder/CutPlans/CutPlan') AS p(n)
     CROSS APPLY p.n.nodes('Result/MarkerSpreadings/MarkerSpreading') AS m(n)
     CROSS APPLY m.n.nodes('Marker/Section/Bundle') AS b(n);
GO

/* --- pastal + serim kumesi (sablondaki bir satir) ---------------------- */
CREATE OR ALTER FUNCTION dbo.fn_AccuplanMarkerBase (@WorkOrderName nvarchar(200))
RETURNS TABLE
AS RETURN
    SELECT
        PlanNo     = p.n.value('for $i in . return count(../*[. << $i]) + 1', 'int'),
        MarkerIdx  = m.n.value('for $i in . return count(../*[. << $i]) + 1', 'int'),
        SetIdx     = ISNULL(s.n.value('for $i in . return count(../*[. << $i]) + 1', 'int'), 1),
        OrderNumber= m.n.value('(Marker/@OrderNumber)[1]', 'int'),
        MarkerName = m.n.value('(Marker/@Name)[1]',        'nvarchar(100)'),
        CustomName = m.n.value('(Marker/@CustomName)[1]',  'nvarchar(100)'),
        MarkerWidthIn = m.n.value('(Marker/@Width)[1]',    'float'),
        Utilization   = ISNULL(m.n.value('(Marker/@Utilization)[1]',     'float'), 0),
        MadeUtil      = ISNULL(m.n.value('(Marker/@MadeUtilization)[1]', 'float'), 0),
        MadeLengthIn  = ISNULL(m.n.value('(Marker/@MadeLength)[1]',      'float'), 0),
        LayLimits     = m.n.value('(Marker/@LayLimits)[1]',   'nvarchar(100)'),
        SpreadMethod  = m.n.value('(Marker/@SpreadMethod)[1]','nvarchar(50)'),
        IsApproved    = CASE WHEN m.n.value('(@IsApproved)[1]', 'nvarchar(10)') = 'true' THEN 1 ELSE 0 END,
        /* KAT SAYISI: serim kumesindeki tum renklerin kat toplami */
        Kat           = ISNULL(s.n.value('sum(plySet/@PlyQuantity)', 'float'), 0),
        /* SERIM: ayni pastalin tekrar serim adedi */
        Serim         = ISNULL(s.n.value('(@SpreadQuantity)[1]', 'float'), 1)
      FROM dbo.fn_AccuplanDoc(@WorkOrderName) AS d
     CROSS APPLY d.doc.nodes('/WorkOrder/CutPlans/CutPlan') AS p(n)
     CROSS APPLY p.n.nodes('Result/MarkerSpreadings/MarkerSpreading') AS m(n)
     OUTER APPLY m.n.nodes('SpreadSets/SpreadSet') AS s(n);
GO
