/**
 * Phase 2 – Facebook Marketing API.
 *
 * Noch NICHT aktiv. Dieses Modul ist der vorbereitete Andockpunkt, um später
 * Spend, Impressionen und Placement-Daten direkt aus Facebook zu ziehen und
 * über die UTM-/Anzeigengruppen-Namen mit den Sheet-Leads zusammenzuführen.
 *
 * Geplanter Ablauf:
 *  1. FB_ACCESS_TOKEN + FB_AD_ACCOUNT_ID aus der .env lesen.
 *  2. Insights-Endpoint abfragen, aufgeschlüsselt nach
 *     campaign_name / adset_name / ad_name und breakdown=publisher_platform,
 *     platform_position (= Placement).
 *  3. Über die Namen (adset_name == utm_source usw.) an die Leads joinen,
 *     um echte Kosten je Kampagne/Anzeigengruppe/Creative/Placement zu zeigen
 *     – statt sie manuell im Sheet zu pflegen.
 *
 * Endpoint-Skizze:
 *   GET https://graph.facebook.com/v21.0/{ad_account_id}/insights
 *       ?level=ad
 *       &fields=campaign_name,adset_name,ad_name,spend,impressions,clicks,actions
 *       &breakdowns=publisher_platform,platform_position
 *       &time_range={'since':'YYYY-MM-DD','until':'YYYY-MM-DD'}
 */

export function isFacebookConfigured() {
  return Boolean(process.env.FB_ACCESS_TOKEN && process.env.FB_AD_ACCOUNT_ID);
}

export async function fetchFacebookInsights() {
  // Bewusst noch nicht implementiert (Phase 2).
  throw new Error('Facebook-Anbindung ist noch nicht aktiv (Phase 2).');
}
