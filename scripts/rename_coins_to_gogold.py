#!/usr/bin/env python3
"""
Renomme "coins" -> "GoGold" dans stream_mobile (texte UI + variables/styles internes).

NE TOUCHE PAS :
  - Les cles JSON/API partagees avec le backend (coins_balance, coins_amount,
    coins_cost, entry_price_coins, etc. -- tout identifiant snake_case contenant
    "coins" et les champs d'objets API).
  - Les codes d'erreur backend ('insufficient_coins', etc.).
  - L'endpoint /access/coins.
  - Les occurrences de "coin" signifiant "angle" (coin d'ecran) -- exclues par
    une liste de fichiers/lignes connus (faux positifs releves manuellement).

Usage:
    python scripts/rename_coins_to_gogold.py            # dry-run (affiche le diff)
    python scripts/rename_coins_to_gogold.py --apply     # applique reellement

Le script :
  1. Renomme BuyCoinsScreen.tsx -> BuyGoGoldScreen.tsx, le composant, la route
     de navigation 'BuyCoins' -> 'BuyGoGold', et tous les navigate('BuyCoins', ...).
  2. Remplace les templates de pluriel conditionnel `coin${x>1?'s':''}` par
     `GoGold` invariable (identifies manuellement, liste ci-dessous).
  3. Remplace les identifiants camelCase contenant "Coins"/"coins" par leur
     equivalent "GoGold" (myCoins -> myGoGold, coinsInput -> goGoldInput, ...),
     SAUF ceux qui matchent un motif de cle API snake_case ou une liste
     d'exclusion explicite.
  4. Remplace le texte UI affiche (chaines entre guillemets/template strings)
     "coins"/"Coins"/"COINS" -> "GoGold"/"GoGold"/"GOGOLD", en laissant
     invariable (pas de "s" final).
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# ---------------------------------------------------------------------------
# 1. Fichiers/lignes a ignorer completement (faux positifs "coin" = angle)
# ---------------------------------------------------------------------------
EXCLUDE_LINE_SUBSTRINGS = [
    "coin haut",
    "coin bas",
    "coins arrondis",
    "Poignees coins",
    "Coin gauche",
    "Coin droit",
    "Durée coin",
    "count-up",  # commentaire "Animated coin count-up" (WalletScreen.tsx:253) -- pas la monnaie
]

# ---------------------------------------------------------------------------
# 2. Cles API / backend a NE JAMAIS renommer (snake_case, contrat JSON)
# ---------------------------------------------------------------------------
API_KEY_PATTERNS = [
    r"\bcoins_balance\b", r"\bcoins_amount\b", r"\bcoins_cost\b",
    r"\bcoins_spent\b", r"\bcoins_debited\b", r"\bcoins_remaining\b",
    r"\bcoins_paid\b", r"\bcoins_earned\b", r"\bcoins_generated\b",
    r"\bcoins_to_next\b", r"\bcoins_total\b", r"\bcollected_coins\b",
    r"\btarget_amount_coins\b", r"\brefund_coins\b", r"\bmissing_coins\b",
    r"\bcost_coins\b", r"\bmonthly_earnings_coins\b",
    r"\bentry_price_coins\b", r"\bstage_coins\b", r"\bmonetization_coins\b",
    r"\btotal_coins_earned\b", r"\bmonthly_coins_earned\b",
    r"\bgifts_coins_earned\b", r"\bcommunity_coins_earned\b",
    r"\bweekly_coins\b", r"\binsufficient_coins\b",
    r"/access/coins\b",
    r"amount_per_member",
]
API_KEY_RE = re.compile("|".join(API_KEY_PATTERNS))

# Litteral de string exact 'coins'/"coins" (valeur de discriminant backend ou
# comparaison sur message d'erreur) -> masque au meme titre qu'une cle API,
# SANS sauter le reste de la ligne (qui peut contenir du texte UI a remplacer).
API_VALUE_LITERAL_RE = re.compile(r"""(['"])coins\1""")

# ---------------------------------------------------------------------------
# 3. Templates de pluriel conditionnel "coin${x>1?'s':''}" -> "GoGold" invariable
#    (reperes manuellement dans CommunityDetailScreen.tsx et CommunitiesScreen.tsx)
# ---------------------------------------------------------------------------
PLURAL_TEMPLATE_RE = re.compile(r"coin\$\{[^}]*\?\s*'s'\s*:\s*''\s*\}")

# ---------------------------------------------------------------------------
# 4. Renommage de la route de navigation BuyCoins -> BuyGoGold
# ---------------------------------------------------------------------------
BUY_COINS_SCREEN_OLD = SRC / "screens" / "Wallet" / "BuyCoinsScreen.tsx"
BUY_COINS_SCREEN_NEW = SRC / "screens" / "Wallet" / "BuyGoGoldScreen.tsx"


def rename_buy_coins_screen(apply: bool) -> list[str]:
    changes = []
    if not BUY_COINS_SCREEN_OLD.exists():
        return changes
    text = BUY_COINS_SCREEN_OLD.read_text(encoding="utf-8")
    new_text = text.replace("BuyCoinsScreen", "BuyGoGoldScreen")
    changes.append(f"[rename] {BUY_COINS_SCREEN_OLD.relative_to(ROOT)} -> {BUY_COINS_SCREEN_NEW.relative_to(ROOT)}")
    if apply:
        BUY_COINS_SCREEN_NEW.write_text(new_text, encoding="utf-8")
        BUY_COINS_SCREEN_OLD.unlink()
    return changes


def replace_buy_coins_route(text: str) -> tuple[str, int]:
    count = 0

    def sub_import(m):
        nonlocal count
        count += 1
        return m.group(0).replace("BuyCoinsScreen", "BuyGoGoldScreen").replace(
            "screens/Wallet/BuyCoinsScreen", "screens/Wallet/BuyGoGoldScreen"
        )

    text, n = re.subn(r"import BuyCoinsScreen\s+from\s+'[^']*BuyCoinsScreen';", sub_import, text)
    count += n

    text, n = re.subn(r"\bBuyCoinsScreen\b", "BuyGoGoldScreen", text)
    count += n

    text, n = re.subn(r"navigate\('BuyCoins'", "navigate('BuyGoGold'", text)
    count += n
    text, n = re.subn(r"navigate\(\"BuyCoins\"", 'navigate("BuyGoGold"', text)
    count += n
    text, n = re.subn(r"screen:\s*'BuyCoins'", "screen: 'BuyGoGold'", text)
    count += n
    text, n = re.subn(r'name="BuyCoins"', 'name="BuyGoGold"', text)
    count += n
    text, n = re.subn(r"^(\s*)BuyCoins(:\s*\{)", r"\1BuyGoGold\2", text, flags=re.MULTILINE)
    count += n

    return text, count


# ---------------------------------------------------------------------------
# 5. Identifiants camelCase internes (variables/fonctions/styles) a renommer
# ---------------------------------------------------------------------------
# On renomme "Coins" -> "GoGold" et "coins" -> "goGold" a l'INTERIEUR d'un
# identifiant camelCase, mais seulement si la ligne ne matche pas une cle API
# (deja filtree par API_KEY_RE / API_VALUE_LITERAL_RE en amont).
CAMEL_COINS_RE = re.compile(r"\bcoins([A-Z]\w*)\b")   # coinsInput, coinsToEur...
CAMEL_XCOINS_RE = re.compile(r"\b([a-z]\w*)Coins\b")  # myCoins, walletCoins, isCoins...
CAMEL_COINS_ALONE_RE = re.compile(r"\bcoins\b")       # variable seule 'coins' (rare, hors API)


def replace_identifiers(line: str) -> tuple[str, int]:
    count = 0

    def sub_prefix(m):
        nonlocal count
        count += 1
        return "goGold" + m.group(1)

    def sub_suffix(m):
        nonlocal count
        count += 1
        return m.group(1) + "GoGold"

    line, n1 = CAMEL_COINS_RE.subn(sub_prefix, line)
    line, n2 = CAMEL_XCOINS_RE.subn(sub_suffix, line)
    count += n1 + n2
    return line, count


# ---------------------------------------------------------------------------
# 6. Texte UI affiche : "coins" / "Coins" / "COINS" -> "GoGold" / "GoGold" / "GOGOLD"
# ---------------------------------------------------------------------------
def replace_ui_text(line: str) -> tuple[str, int]:
    count = 0

    def sub(m):
        nonlocal count
        count += 1
        word = m.group(0)
        if word.isupper():
            return "GOGOLD"
        if word[0].isupper():
            return "GoGold"
        return "GoGold"  # invariable, minuscule ou pas

    line, n = re.subn(r"\b[Cc][Oo][Ii][Nn][Ss]\b", sub, line)
    count += n
    return line, count


def should_skip_line(line: str) -> bool:
    if any(sub in line for sub in EXCLUDE_LINE_SUBSTRINGS):
        return True
    return False


def process_file(path: Path, apply: bool) -> list[str]:
    changes = []
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    new_lines = []
    file_changed = False

    for i, line in enumerate(lines, start=1):
        original = line

        if should_skip_line(line):
            new_lines.append(line)
            continue

        # Masquer temporairement les cles API et les litteraux 'coins' exacts
        # (discriminants backend) pour ne pas les toucher, sans sauter le
        # reste de la ligne qui peut contenir du texte UI a remplacer.
        masked = line
        placeholder_map = {}
        for idx, m in enumerate(list(API_KEY_RE.finditer(masked)) + list(API_VALUE_LITERAL_RE.finditer(masked))):
            token = f"@@API{idx}@@"
            placeholder_map[token] = m.group(0)
            masked = masked.replace(m.group(0), token, 1)

        # 1. Templates de pluriel conditionnel -> GoGold invariable
        masked, n_plural = PLURAL_TEMPLATE_RE.subn("GoGold", masked)

        # 2. Identifiants camelCase
        masked, n_ident = replace_identifiers(masked)

        # 3. Texte UI brut restant (coins/Coins/COINS)
        masked, n_ui = replace_ui_text(masked)

        # Restaurer les cles API masquees
        for token, original_key in placeholder_map.items():
            masked = masked.replace(token, original_key)

        total = n_plural + n_ident + n_ui
        if total > 0:
            file_changed = True
            changes.append(f"  L{i}: {total} remplacement(s)")
        new_lines.append(masked)

    if file_changed:
        new_text = "".join(new_lines)
        if apply:
            path.write_text(new_text, encoding="utf-8")
        rel = path.relative_to(ROOT)
        header = f"[edit] {rel}"
        return [header] + changes
    return []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Applique les changements (par defaut: dry-run)")
    args = parser.parse_args()

    all_changes = []

    all_changes += rename_buy_coins_screen(args.apply)

    ts_files = sorted(SRC.rglob("*.ts")) + sorted(SRC.rglob("*.tsx"))
    for path in ts_files:
        if path.name == "BuyCoinsScreen.tsx":
            continue  # deja traite par rename_buy_coins_screen

        text = path.read_text(encoding="utf-8")
        route_text, n_route = replace_buy_coins_route(text)
        if n_route > 0:
            if args.apply:
                path.write_text(route_text, encoding="utf-8")
            all_changes.append(f"[route] {path.relative_to(ROOT)}: {n_route} remplacement(s) BuyCoins->BuyGoGold")
            if not args.apply:
                # relire depuis le texte modifie en memoire pour la suite du dry-run
                pass

    for path in ts_files:
        if path.name == "BuyCoinsScreen.tsx":
            continue
        changes = process_file(path, args.apply)
        all_changes += changes

    mode = "APPLIQUE" if args.apply else "DRY-RUN (aucune modification ecrite)"
    print(f"=== Mode: {mode} ===\n")
    if not all_changes:
        print("Aucune occurrence trouvee.")
    else:
        print("\n".join(all_changes))
        print(f"\n{len(all_changes)} lignes de rapport.")

    if not args.apply:
        print("\nRelancer avec --apply pour ecrire les changements.")


if __name__ == "__main__":
    main()
