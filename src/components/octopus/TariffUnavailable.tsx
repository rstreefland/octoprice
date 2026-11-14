export function TariffUnavailable({ name = "This tariff" }: { name?: string }) {
  return (
    <p className="lg:col-[content] my-4" role="status">
      {name} isn&apos;t currently available from Octopus.
    </p>
  );
}
