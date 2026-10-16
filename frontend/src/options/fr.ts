// French wording of the settings page (owner decision, 2026-10-16). Shared
// modules keep their English copy for the in-page modal; this page maps the
// same stable IDs and codes to French here, never by translating at runtime.
import type { ErrorCode } from '../shared/errors';
import type { KeyAction } from '../shared/keybindings';
import { PROVIDERS, type RouteSlot } from '../shared/models';
import type { Period, QuotaNote, QuotaTask } from '../shared/quota';
import type { RewriteStyleId } from '../shared/rewrite';
import type { ArabicVariant, LanguageId } from '../shared/translate';

const SETTINGS = 'Paramètres de Correctly → Fournisseurs IA';
const LIMITS = 'Paramètres de Correctly → Limites d’usage';

const ERRORS: Record<ErrorCode, string> = {
  NOT_CONFIGURED: `Aucun fournisseur d’IA n’est configuré pour cette action. Ajoutez une clé API et choisissez un modèle dans ${SETTINGS}.`,
  ROUTE_BROKEN: `La clé API choisie pour cette action a été supprimée ou est incomplète. Choisissez-en une autre dans ${SETTINGS}. Aucune autre clé n’a été utilisée.`,
  PROFILE_DISABLED: `La clé API choisie pour cette action est désactivée. Activez-la ou choisissez-en une autre dans ${SETTINGS}. Aucune autre clé n’a été utilisée.`,
  ROUTE_CHANGED:
    'La clé API de cette requête a été modifiée ou supprimée pendant son exécution : la requête a été arrêtée. Elle peut quand même être facturée.',
  INVALID_KEY: `Le fournisseur a refusé cette clé API. Remplacez-la ou vérifiez-la dans ${SETTINGS}.`,
  PERMISSION_DENIED:
    'Le fournisseur a refusé cette requête pour votre clé ou projet (API désactivée, restrictions de clé, région ou facturation). Vérifiez le tableau de bord du fournisseur.',
  MODEL_UNAVAILABLE: `Ce modèle n’est pas disponible pour cette clé. Choisissez un autre modèle dans ${SETTINGS}. Aucun autre modèle n’a été utilisé.`,
  MODEL_INCOMPATIBLE: `Ce modèle n’accepte pas les options dont Correctly a besoin (sortie JSON structurée). Choisissez un autre modèle dans ${SETTINGS}.`,
  RATE_LIMITED:
    'Le fournisseur limite le débit, ou votre quota ou plafond de facturation chez lui est atteint (ce n’est pas une limite de Correctly). Aucun changement automatique n’a été fait ; réessayez plus tard.',
  QUOTA_EXCEEDED: `Une limite d’usage de Correctly est atteinte : aucune requête n’a été envoyée. Voir ${LIMITS}.`,
  AI_PAUSED: `Les requêtes IA sont en pause dans ${LIMITS}. Aucune requête n’a été envoyée. Les raccourcis texte fonctionnent toujours.`,
  QUOTA_UNAVAILABLE: `Correctly ne peut pas vérifier vos limites d’usage pour le moment. Aucune requête IA n’a été envoyée. Ouvrez ${LIMITS}.`,
  CLOCK_CHANGED: `L’horloge de votre ordinateur a reculé : les requêtes IA sont en pause jusqu’à ce que vous confirmiez l’heure dans ${LIMITS}. Aucune requête n’a été envoyée.`,
  CONSENT_REQUIRED:
    'Autorisez d’abord l’envoi du texte sélectionné à votre fournisseur d’IA (section Démarrage).',
  NETWORK_ERROR:
    'Hors ligne ou erreur réseau : vérifiez votre connexion internet.',
  TIMEOUT:
    'Le fournisseur n’a pas répondu à temps. La requête peut quand même être facturée ; ne réessayez que si vous voulez faire une nouvelle requête.',
  RESPONSE_LOST:
    'La connexion a été perdue après l’envoi. Le fournisseur a pu recevoir la requête et la facturer ; ne réessayez que si vous voulez faire une nouvelle requête.',
  PROVIDER_ERROR:
    'Le fournisseur a renvoyé une erreur. Réessayez plus tard ; si cela persiste, vérifiez son tableau de bord.',
  INVALID_RESPONSE:
    'Le fournisseur a répondu, mais la réponse est inutilisable (incomplète ou mal formée). Rien n’a été confirmé ni modifié.',
  RESPONSE_REFUSED:
    'Le fournisseur a refusé de traiter ce texte. Rien n’a été modifié.',
  STORAGE_ERROR:
    'Le stockage du navigateur n’a pas pu être lu ou écrit. Rechargez cette page et réessayez.',
  UNKNOWN_ERROR:
    'Une erreur inattendue s’est produite. Rechargez cette page et réessayez.',
};

export const erreur = (code: ErrorCode): string => ERRORS[code];

export const SLOT_FR: Record<RouteSlot, string> = {
  default: 'Par défaut',
  correction: 'Correction',
  rewrite: 'Reformulation',
  translation: 'Traduction',
  translateRewrite: 'Traduire et reformuler',
  summary: 'Résumé',
};

export const TASK_FR: Record<QuotaTask, string> = {
  correction: SLOT_FR.correction,
  rewrite: SLOT_FR.rewrite,
  translation: SLOT_FR.translation,
  translateRewrite: SLOT_FR.translateRewrite,
  summary: SLOT_FR.summary,
  test: 'Tests de connexion',
};

export const PERIOD_FR: Record<Period, string> = {
  daily: 'Par jour',
  weekly: 'Par semaine',
  monthly: 'Par mois',
};
const PERIOD_NOUN: Record<Period, string> = {
  daily: 'journalière',
  weekly: 'hebdomadaire',
  monthly: 'mensuelle',
};

export const STYLE_FR: Record<
  RewriteStyleId,
  { label: string; description: string }
> = {
  professional: {
    label: 'Professionnel',
    description: 'adapté au travail, clair et concis',
  },
  formal: { label: 'Formel', description: 'registre soutenu et poli' },
  friendly: {
    label: 'Amical',
    description: 'chaleureux, naturel et accessible, sans emojis',
  },
  casual: { label: 'Décontracté', description: 'conversationnel et détendu' },
  polite: {
    label: 'Poli',
    description: 'respectueux et attentionné, sans excuses excessives',
  },
  concise: {
    label: 'Concis',
    description:
      'plus court, en gardant dates, nombres, négations et conditions',
  },
  funny: {
    label: 'Drôle',
    description: 'humour léger et bienveillant, sérieux si le sujet l’est',
  },
};

export const LANGUAGE_FR: Record<LanguageId, string> = {
  fr: 'Français',
  en: 'Anglais',
  ar: 'Arabe',
  tr: 'Turc',
  de: 'Allemand',
  es: 'Espagnol',
};

export const VARIANT_FR: Record<ArabicVariant, string> = {
  msa: 'Arabe standard moderne',
  syrian: 'Syrien (dialecte parlé)',
};

/** Nombres à la française : « 5 000 » (accepté aussi à la saisie). */
export const nombre = (value: number): string => value.toLocaleString('fr-FR');

/** « lun. 19 oct., 00:00 (Europe/Paris) » — l’instant réel, heure d’été comprise. */
export function dateReset(resetAt: number, timezone: string): string {
  const text = new Intl.DateTimeFormat('fr-FR', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(resetAt));
  return `${text} (${timezone})`;
}

/** « limite journalière de requêtes de correction »… */
export function nomLimite(
  note: Pick<QuotaNote, 'scope' | 'task' | 'provider' | 'period'>,
  credentialLabel = 'cette clé API',
): string {
  const period = PERIOD_NOUN[note.period];
  switch (note.scope) {
    case 'global':
      return `limite ${period} du total des requêtes IA`;
    case 'task':
      return `limite ${period} des requêtes « ${TASK_FR[note.task ?? 'test']} »`;
    case 'provider':
      return `limite ${period} des requêtes ${note.provider ? PROVIDERS[note.provider].label : 'du fournisseur'}`;
    case 'credential':
      return `limite ${period} des requêtes pour ${credentialLabel}`;
  }
}

const majuscule = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** Une phrase, texte brut uniquement (affichée avec textContent). */
export function decrireNote(note: QuotaNote, credentialLabel?: string): string {
  const name = nomLimite(note, credentialLabel);
  const counts = `(${nombre(note.used)} / ${nombre(note.max)})`;
  const reset = `Remise à zéro : ${dateReset(note.resetAt, note.timezone)}.`;
  if (note.blocked)
    return `${majuscule(name)} atteinte ${counts}. Aucune requête n’a été envoyée. ${reset}`;
  if (note.level === 100)
    return `${majuscule(name)} atteinte ${counts}. Les requêtes suivantes qu’elle couvre sont bloquées jusqu’à la remise à zéro. ${reset}`;
  const left = Math.max(0, note.max - note.used);
  return `Correctly : ${note.level} % de votre ${name} utilisés ${counts}. ${note.level === 95 ? 'Plus que ' : 'Il reste '}${nombre(left)}. ${reset}`;
}

/** Date et heure locales lisibles. */
export const dateHeure = (date: Date): string =>
  Number.isNaN(date.getTime()) ? '' : date.toLocaleString('fr-FR');

/** Actions of Correctly's own keyboard shortcuts. */
export const KEY_ACTION_FR: Record<KeyAction, string> = {
  open: 'Ouvrir Correctly',
  correct: 'Corriger la sélection',
  rewrite: 'Reformuler la sélection',
  translate: 'Traduire la sélection',
};

/** Browser commands of the manifest, by name. */
export const COMMAND_FR: Record<string, string> = {
  _execute_action: 'Bouton de la barre d’outils',
  'open-correctly': KEY_ACTION_FR.open,
  'correct-selection': KEY_ACTION_FR.correct,
  'rewrite-selection': KEY_ACTION_FR.rewrite,
  'translate-selection': KEY_ACTION_FR.translate,
};
