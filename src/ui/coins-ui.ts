import type { SheetController } from "./controller";
import { h } from "./h";

const COINS = [["pp", "Platinum"], ["gp", "Gold"], ["ep", "Electrum"], ["sp", "Silver"], ["cp", "Copper"]] as const;

/** Five labelled number boxes, always editable (Play mode too). Used on the Main page and at the top of the Inventory card, so both always agree. */
export function coinsRow(ctl: SheetController): HTMLElement {
  const coins = ctl.character!.coins;
  return h("div", { cls: "fe-coins", data: { coins: "" } }, ...COINS.map(([k, word]) => {
    const input = h("input", { cls: "fe-coin-in", attrs: { type: "number", inputmode: "numeric", min: "0", step: "1", value: String(coins[k]), "aria-label": `${word} coins (${k})` }, data: { coin: k },
      on: { change: (e: Event) => {
        const raw = (e.target as HTMLInputElement).value.trim(), n = raw === "" ? 0 : Number(raw);
        if (!Number.isFinite(n) || n < 0) { ctl.host.notify("Coins must be a whole number, 0 or more."); ctl.emit(); return; }
        ctl.dispatch({ type: "coins", coin: k, value: Math.floor(n) });
      } } });
    return h("label", { cls: "fe-coin", title: word }, h("span", { cls: "fe-muted", text: k }), input);
  }));
}
