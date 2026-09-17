import { useMemo } from 'react';
import { formatUnits } from 'viem';

import { MAX_COIN_COUNT, type CoinflipBet } from '../lib/coinflip';
import { BetAmountInput, CtaButton, Slider, ToggleTab, TokenIcon } from './ui/controls';
import { HeadsIcon, RocketIcon, TailsIcon } from './ui/icons';
import { ToggleSwitch } from './ui/ToggleSwitch';

export type SidebarProps = {
  form: CoinflipBet;
  setForm: (form: CoinflipBet) => void;
  wagerInput: string;
  setWagerInput: (value: string) => void;
  balance: bigint | undefined;
  /** Largest wager the platform accepts right now (risk limit), if known. */
  maxWager: bigint | undefined;
  decimals: number;
  symbol: string;
  tokenIconUrl?: string;
  fastMode: boolean;
  setFastMode: (value: boolean) => void;
  ctaLabel: string;
  ctaDisabled: boolean;
  reason: string | null;
  onBet: () => void;
};

export function Sidebar({
  form,
  setForm,
  wagerInput,
  setWagerInput,
  balance,
  maxWager,
  decimals,
  symbol,
  tokenIconUrl,
  fastMode,
  setFastMode,
  ctaLabel,
  ctaDisabled,
  reason,
  onBet,
}: SidebarProps) {
  const formattedBalance = useMemo(() => {
    if (balance === undefined) return null;
    try {
      return Number(formatUnits(balance, decimals)).toLocaleString('en', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      return null;
    }
  }, [balance, decimals]);

  const adjustWager = (factor: number) => {
    const next = (Number(wagerInput) || 0) * factor;
    if (next > 0) setWagerInput(next.toString());
  };

  const setMaxWager = () => {
    const candidates = [balance, maxWager].filter((value): value is bigint => value !== undefined);
    if (candidates.length === 0) return;
    setWagerInput(
      formatUnits(
        candidates.reduce((a, b) => (a < b ? a : b)),
        decimals,
      ),
    );
  };

  return (
    <aside className="ck-sidebar">
      <ToggleTab
        options={[
          { value: 'manual', label: 'Manual' },
          {
            value: 'auto',
            label: 'Auto',
            disabled: true,
            disabledReason: 'Auto-bet is not part of this example',
          },
        ]}
        value="manual"
        onChange={() => {}}
      />

      <div className="ck-sidebar__scroll">
        <div className="ck-sidebar__bet-block">
          <label className="ck-sidebar__bet-label" htmlFor="cf-wager">
            Bet Amount
          </label>
          <BetAmountInput
            id="cf-wager"
            value={wagerInput}
            onChange={e => setWagerInput(e.target.value)}
            placeholder="0.00"
            leading={<TokenIcon symbol={symbol} iconUrl={tokenIconUrl} size={23} />}
          />
          <div className="ck-sidebar__chips">
            <button type="button" className="ck-chip" onClick={() => adjustWager(0.25)}>
              1/4
            </button>
            <button type="button" className="ck-chip" onClick={() => adjustWager(0.5)}>
              1/2
            </button>
            <button type="button" className="ck-chip" onClick={() => adjustWager(2)}>
              2x
            </button>
            <button type="button" className="ck-chip" onClick={setMaxWager}>
              Max
            </button>
          </div>
        </div>

        <div className="cf-pick">
          <button
            type="button"
            className={`cf-pick__pill${form.pickHeads ? ' cf-pick__pill--active' : ''}`}
            aria-pressed={form.pickHeads}
            onClick={() => setForm({ ...form, pickHeads: true })}
          >
            <span className="cf-pick__face">
              Heads
              <HeadsIcon className="cf-pick__icon" />
            </span>
          </button>
          <button
            type="button"
            className={`cf-pick__pill${!form.pickHeads ? ' cf-pick__pill--active' : ''}`}
            aria-pressed={!form.pickHeads}
            onClick={() => setForm({ ...form, pickHeads: false })}
          >
            <span className="cf-pick__face">
              Tails
              <TailsIcon className="cf-pick__icon" />
            </span>
          </button>
        </div>

        <div className="cf-slider-row">
          <label className="cf-slider-row__label" htmlFor="cf-coins">
            Number of Coins
          </label>
          <Slider
            id="cf-coins"
            min={1}
            max={MAX_COIN_COUNT}
            step={1}
            value={form.coinCount}
            onChange={e => {
              const coinCount = Number(e.target.value);
              setForm({ ...form, coinCount, minWins: Math.min(form.minWins, coinCount) });
            }}
            aria-label="Number of coins"
          />
        </div>

        <div className="cf-slider-row">
          <label className="cf-slider-row__label" htmlFor="cf-hits">
            Required Hits
          </label>
          <Slider
            id="cf-hits"
            min={1}
            max={form.coinCount}
            step={1}
            value={form.minWins}
            onChange={e => setForm({ ...form, minWins: Number(e.target.value) })}
            aria-label="Required hits"
          />
        </div>
      </div>

      <div className="ck-sidebar__foot ck-sidebar__foot--fastmode">
        <div className="ck-sidebar__fastmode">
          <span className="ck-sidebar__fastmode-label">
            <RocketIcon />
            Fast Mode
          </span>
          <ToggleSwitch checked={fastMode} onChange={setFastMode} aria-label="Fast Mode" />
        </div>
      </div>

      <div className="ck-sidebar__foot ck-sidebar__foot--cta">
        {formattedBalance !== null && (
          <div className="ck-sidebar__balance">
            <span className="ck-sidebar__balance-label">Balance:</span>
            <span className="ck-sidebar__balance-value">
              <TokenIcon symbol={symbol} iconUrl={tokenIconUrl} size={18} />
              <span className="ck-sidebar__balance-amount">{formattedBalance}</span>
            </span>
          </div>
        )}
        <CtaButton disabled={ctaDisabled} onClick={onBet}>
          {ctaLabel}
        </CtaButton>
        {reason && <p className="ck-sidebar__reason">{reason}</p>}
      </div>
    </aside>
  );
}
