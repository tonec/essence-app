type Props = {
  onClick: () => void;
  disabled?: boolean;
};

export function ResetViewButton({ onClick, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="pointer-events-auto absolute right-4 top-4 rounded-md border border-white/15 bg-black/60 px-3 py-1.5 text-xs text-white/80 shadow-lg backdrop-blur transition hover:border-white/40 hover:text-white disabled:opacity-40"
    >
      Reset view
    </button>
  );
}
