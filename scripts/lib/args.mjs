export const createArgs = (argv) => {
  const rest = [...argv];

  const takeFlag = (name) => {
    const index = rest.indexOf(`--${name}`);
    if (index < 0) return undefined;
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      rest.splice(index, 1);
      return "";
    }
    rest.splice(index, 2);
    return value;
  };

  const hasFlag = (name) => {
    const index = rest.indexOf(`--${name}`);
    if (index < 0) return false;
    rest.splice(index, 1);
    return true;
  };

  const positional = () => rest.filter((arg) => !arg.startsWith("-"));

  return { takeFlag, hasFlag, positional };
};
