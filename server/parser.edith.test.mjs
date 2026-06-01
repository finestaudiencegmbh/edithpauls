/**
 * Test für das generische Sheet-Mapping am Beispiel des Webinar-Funnel-Sheets
 * "KPIs Webinar B2C_Edith Pauls" (Kopfzeilen 1:1 aus dem echten Sheet).
 * Prüft: Leads-Tab wird über die Projekt-Config erkannt und gemappt, die
 * Creative-Übersicht liefert Adspend je Creative, die Paid/Organic-Klassifizierung
 * greift (CBO-Anzeigengruppe = paid, email/newsletter = organisch) und der
 * Termine-Tab wird NICHT fälschlich als Leads gezählt.
 * Ausführen:  node server/parser.edith.test.mjs
 */
import assert from 'node:assert/strict';
import { parseSheets } from './parser.js';
import { buildDataset } from './build.js';
import { loadScoringConfig } from './scoring.js';
import { loadProjectConfig } from './project.js';

const project = loadProjectConfig();
assert.equal(project.features.hasTickets, false, 'dieses Projekt hat keine Tickets');
assert.equal(project.features.hasQuality, false, 'dieses Projekt hat kein Scoring');

// Creative-Übersicht (Adspend je Creative, nicht je Anzeigengruppe)
const overviewSheet = {
  title: 'Übersicht Creatives',
  values: [
    ['Status', 'Creative', 'Adspend', 'CPC', 'Ausg. Klicks', 'CVR Start', 'Leads', 'Termine', 'Closings', 'CPL', 'Pro Termin', 'Pro Close', 'Cash Collect', 'Revenue', 'ROAS', 'ROAS Auftrag'],
    ['AKTIV', 'CBO Creative 7 AG1', '10,43 €', '5,22 €', '2', '200,00%', '4', '3', '3', '2,61 €', '3,48 €', '3,48 €', '0,00 €', '0,00 €', '0,00', '0,00'],
    ['INAKTIV', 'Static 5: Innere Unruhe AG2', '142,71 €', '2,80 €', '51', '9,80%', '5', '2', '1', '28,54 €', '71,36 €', '142,71 €', '0,00 €', '0,00 €', '0,00', '0,00'],
  ],
};

// Leads-Tab (echte Kopfzeile: Datum/Name/E-Mail/UTM …, kein "Gewonnen am")
const leadsSheet = {
  title: 'Leads',
  values: [
    ['Datum', 'Name', 'E-Mail', 'UTM Source', 'UTM Medium', 'UTM  Campaign', 'Leads', 'Leads aus Ads', 'Leads aus Organisch', 'Leads aus Newsletter', 'Leads aus Instagram', 'A/B Variante', 'Variante 1', 'Variante 1', 'Variante 2', 'Variante 2'],
    ['161', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], // Summenzeile -> ignorieren
    ['2026-03-05 19:54:22 +0000', 'Lydia König', 'l.koenig@web.de', 'email', 'mobile', 'workshop', '', '', '', '', '', 'V1', '', '', '', ''],
    ['2026-03-08 14:29:25 +0000', 'Edda Beispiel', 'edda@gmail.com', 'CBO AG2: Mütter 070326', 'Static 2: Beziehungsfähig AG2', 'CBO B2C // Live-Workshop // Leads 060326', '', '', '', '', '', 'V1', '', '', '', ''],
    ['2026-03-09 08:00:00 +0000', 'Nadja Newsletter', 'nadja@gmx.de', 'newsletter-220526', 'link-mobil', 'sacredlifewarteliste', '', '', '', '', '', 'V1', '', '', '', ''],
  ],
};

// Termine-Tab: darf NICHT als Leads erkannt werden (kein "Leads aus Ads"/"A/B Variante")
const termineSheet = {
  title: 'Termine',
  values: [
    ['Datum', 'Name', 'E-Mail', 'Telefon', 'UTM Source', 'UTM Medium', 'UTM  Campaign', 'Datum Gespräch', 'Termine', 'Termine aus Ads', 'Zielgruppe?', 'Feedback', 'UTM Source', 'UTM Medium', 'UTM  Campaign'],
    ['2026-03-06 20:05:36 +0000', 'Olga Martens', 'olga@outlook.de', '+49 160 8531840', 'email', 'mobile', 'workshop', '2026-03-09 11:00:00 +0000', '', '', 'Ja', 'Feedback…', 'webinar-geschenk', 'whatsapp', 'first-mover-call'],
  ],
};

const parsed = parseSheets([overviewSheet, leadsSheet, termineSheet], project);

assert.equal(parsed.overview.length, 2, 'beide Creative-Zeilen erkannt');
assert.equal(parsed.overview[0].adset, 'CBO Creative 7 AG1', 'Creative-Name als Schlüssel');
assert.equal(parsed.overview[0].adspend, 10.43, 'deutsches Zahlenformat geparst');
assert.equal(parsed.leads.length, 3, 'Summenzeile ignoriert, Termine-Tab NICHT als Leads gezählt');

const ds = buildDataset(parsed, loadScoringConfig(), project);
const edda = ds.leads.find((l) => l.email === 'edda@gmail.com');
const lydia = ds.leads.find((l) => l.email === 'l.koenig@web.de');
const nadja = ds.leads.find((l) => l.email === 'nadja@gmx.de');

assert.ok(edda && lydia && nadja, 'alle drei Leads im Dataset');
assert.equal(edda.name, 'Edda Beispiel', 'Einzel-Spalte "Name" korrekt übernommen');
assert.equal(edda.sourceType, 'paid', 'CBO-Anzeigengruppe = bezahlt (paidPatterns)');
assert.equal(edda.campaign, 'CBO B2C // Live-Workshop // Leads 060326', 'UTM Campaign gemappt');
assert.equal(edda.adset, 'CBO AG2: Mütter 070326', 'UTM Source -> Anzeigengruppe');
assert.equal(edda.creative, 'Static 2: Beziehungsfähig AG2', 'UTM Medium -> Creative');
assert.equal(lydia.sourceType, 'organic', 'email-Quelle = organisch');
assert.equal(nadja.sourceType, 'organic', 'newsletter = organisch');
assert.equal(edda.hasTicket, false, 'keine Ticket-Logik in diesem Projekt');
assert.equal(edda.quality, null, 'kein Scoring in diesem Projekt');

console.log('✓ Alle Edith-Webinar-Mapping-Tests bestanden');
console.log('  Leads:', ds.counts, '| paid:', ds.leads.filter((l) => l.sourceType === 'paid').length, '| organic:', ds.leads.filter((l) => l.sourceType === 'organic').length);
