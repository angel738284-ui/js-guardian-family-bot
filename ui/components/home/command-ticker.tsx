const COMMANDS = [
  "#kick @spammer",
  "#ytmp3 last last",
  "#remind 2h call mum",
  "#sticker",
  "#poll lunch? | rice | swallow",
  "#story --color teal Happy Friday",
  "#ai summarise this thread",
  "#welcome on",
  "#tts fr: bonjour à tous",
  "#take MyPack|Me",
  "#antilink on",
  "#note set wifi blue-house-24",
  "#tagall",
  "#invite @tolu",
  "#warn @user",
  "#tomp3",
];

export function CommandTicker() {
  const row = [...COMMANDS, ...COMMANDS];
  return (
    <div className="relative overflow-hidden border-y border-border py-5 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
      <div className="ticker flex w-max gap-3" aria-hidden="true">
        {row.map((command, index) => (
          <span key={index} className="whitespace-nowrap rounded-full border border-border px-4 py-1.5 font-mono text-sm text-muted">
            {command}
          </span>
        ))}
      </div>
      <p className="sr-only">Examples of commands: {COMMANDS.join(", ")}</p>
    </div>
  );
}
