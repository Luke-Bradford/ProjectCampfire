async function main() {
  console.log("Seeding database...");
  // TODO: implement seed data for local development
  // - users, friend connections, groups, posts, notifications
  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => process.exit());
