import Link from "next/link";

import { Button, type ButtonProps } from "./button";

type ButtonLinkProps = Omit<ButtonProps, "render" | "nativeButton"> & { href: string };

function ButtonLink({ href, ...props }: ButtonLinkProps) {
  return <Button {...props} render={<Link href={href} />} nativeButton={false} />;
}

export { ButtonLink };
