#!/usr/bin/env python3
"""
Resynchronise stream_mobile avec le backend apres le renommage complet
coins -> gogold cote stream_backend (DB + API). Le script precedent
(rename_coins_to_gogold.py) a deja traite le texte UI et les variables/styles
internes au mobile, en laissant volontairement intactes les cles API/JSON et
le discriminant litteral 'coins' (decision : "garder les cles API telles
quelles" tant que le backend n'etait pas renomme). Le backend l'est
maintenant : ce script applique le mapping exact des cles renommees.

Usage:
    python scripts/sync_api_fields_gogold.py            # dry-run
    python scripts/sync_api_fields_gogold.py --apply     # applique reellement

Mapping applique (identique aux renommages de colonnes/valeurs backend) :
  - champs JSON snake_case : coins_balance -> gogold_balance, etc. (liste FIELD_MAP)
  - discriminant litteral  : 'coins' -> 'gogold' (LiveMonetizationType, PayMethod)
  - endpoint HTTP          : /access/coins -> /access/gogold
  - code d'erreur          : insufficient_coins -> insufficient_gogold
Remplacement exact par mot entier (\\b) — pas de renommage generique de "coins"
puisque tout le texte UI/variables locales a deja ete traite par le script
precedent et ne doit pas etre retouche.
"""
import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# Mapping exact des champs JSON renommes cote backend (voir stream_backend
# migrations.py + modeles SQLAlchemy). Prefixe le plus long en premier pour
# eviter qu'un mapping plus court ne matche une sous-partie en premier.
FIELD_MAP = [
    ("total_coins_earned", "total_gogold_earned"),
    ("monthly_earnings_coins", "monthly_earnings_gogold"),
    ("total_coins", "total_gogold"),
    ("coins_balance", "gogold_balance"),
    ("coins_amount", "gogold_amount"),
    ("coins_cost", "gogold_cost"),
    ("coins_value", "gogold_value"),
    ("coins_spent", "gogold_spent"),
    ("coins_debited", "gogold_debited"),
    ("coins_remaining", "gogold_remaining"),
    ("coins_required", "gogold_required"),
    ("coins_paid", "gogold_paid"),
    ("coins_earned", "gogold_earned"),
    ("coins_generated", "gogold_generated"),
    ("coins_to_next", "gogold_to_next"),
    ("coins_total", "gogold_total"),
    ("coins_received", "gogold_received"),
    ("coins_referrer", "gogold_referrer"),
    ("coins_referred", "gogold_referred"),
    ("collected_coins", "collected_gogold"),
    ("target_amount_coins", "target_amount_gogold"),
    ("refund_coins", "refund_gogold"),
    ("missing_coins", "missing_gogold"),
    ("neededCoins", "neededGoGold"),
    ("cost_coins", "cost_gogold"),
    ("entry_price_coins", "entry_price_gogold"),
    ("monthly_subscription_coins", "monthly_subscription_gogold"),
    ("stage_coins", "stage_gogold"),
    ("monetization_coins", "monetization_gogold"),
    ("monthly_coins_earned", "monthly_gogold_earned"),
    ("gifts_coins_earned", "gifts_gogold_earned"),
    ("community_coins_earned", "community_gogold_earned"),
    ("weekly_coins", "weekly_gogold"),
    ("verification_coins_paid", "verification_gogold_paid"),
    ("bonus_coins", "bonus_gogold"),
    ("coins_escrowed", "gogold_escrowed"),
    ("coins_debited", "gogold_debited"),
    ("coins_required", "gogold_required"),
    ("coins_charged", "gogold_charged"),
    ("coins_credited_to_creator", "gogold_credited_to_creator"),
    ("coins_credited", "gogold_credited"),
    ("coins_organizer", "gogold_organizer"),
    ("coins_for_creator", "gogold_for_creator"),
]

# Code d'erreur backend, evenement WebSocket et endpoint HTTP
LITERAL_MAP = [
    ("insufficient_coins", "insufficient_gogold"),
    ("coin_transfer_received", "gogold_transfer_received"),
    ("/access/coins", "/access/gogold"),
]

# Identifiants camelCase internes au mobile (types/fonctions/callbacks), a
# aligner pour coherence maintenant que le backend est entierement renomme.
IDENTIFIER_MAP = [
    ("CoinTransferPayload", "GoGoldTransferPayload"),
    ("onCoinTransferReceived", "onGoGoldTransferReceived"),
    ("lastCoinTransfer", "lastGoGoldTransfer"),
    ("setLastCoinTransfer", "setLastGoGoldTransfer"),
    ("payCoinsForAccess", "payGoGoldForAccess"),
]

# Discriminant litteral exact 'coins' (LiveMonetizationType, PayMethod) -> 'gogold'
_DISCRIMINANT_RE = re.compile(r"(['\"])coins\1")


def iter_source_files():
    for ext in ("*.ts", "*.tsx"):
        for path in SRC.rglob(ext):
            yield path


def process_text(text: str) -> tuple[str, int]:
    total = 0

    for old, new in LITERAL_MAP:
        text, n = re.subn(re.escape(old), new, text)
        total += n

    for old, new in FIELD_MAP:
        text, n = re.subn(r"\b" + re.escape(old) + r"\b", new, text)
        total += n

    for old, new in IDENTIFIER_MAP:
        text, n = re.subn(r"\b" + re.escape(old) + r"\b", new, text)
        total += n

    text, n = _DISCRIMINANT_RE.subn(r"\1gogold\1", text)
    total += n

    return text, total


def process_file(path: Path, apply: bool) -> list[str]:
    original = path.read_text(encoding="utf-8")
    new_text, total = process_text(original)
    if total == 0:
        return []
    if apply:
        path.write_text(new_text, encoding="utf-8")
    rel = path.relative_to(ROOT)
    return [f"[edit] {rel}: {total} remplacement(s)"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Applique les changements (par defaut: dry-run)")
    args = parser.parse_args()

    all_changes = []
    for path in sorted(iter_source_files()):
        all_changes += process_file(path, args.apply)

    mode = "APPLIQUE" if args.apply else "DRY-RUN (aucune modification ecrite)"
    print(f"=== Mode: {mode} ===\n")
    if not all_changes:
        print("Aucune occurrence trouvee.")
    else:
        print("\n".join(all_changes))
        print(f"\n{len(all_changes)} fichiers modifies.")

    if not args.apply:
        print("\nRelancer avec --apply pour ecrire les changements.")


if __name__ == "__main__":
    main()
