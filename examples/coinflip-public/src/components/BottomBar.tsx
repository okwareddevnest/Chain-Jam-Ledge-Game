export function BottomBar() {
  return (
    <div className="ck-bottombar">
      <div className="ck-bottombar__left">
        <span className="ck-fairness-dot" aria-hidden />
        Provably fair
      </div>
      <div className="ck-bottombar__center">
        <span className="ck-bottombar__logo">chain.wtf</span>
      </div>
      <div className="ck-bottombar__right">Coinflip</div>
    </div>
  );
}
