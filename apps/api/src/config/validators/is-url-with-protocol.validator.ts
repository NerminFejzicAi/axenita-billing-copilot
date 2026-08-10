import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

interface ProtocolConstraint {
  readonly protocols: readonly string[];
}

/**
 * Validates that a value parses as an absolute URL using one of the allowed protocols.
 *
 * `class-validator`'s built-in `@IsUrl` only accepts web protocols, so it cannot validate
 * `postgresql://` or `redis://` connection strings.
 *
 * The failure message deliberately names only the property and the allowed protocols. It
 * never echoes the value, because connection strings carry credentials (09 §9, §11).
 */
@ValidatorConstraint({ name: 'isUrlWithProtocol', async: false })
class IsUrlWithProtocolConstraint implements ValidatorConstraintInterface {
  public validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string' || value.length === 0) {
      return false;
    }

    const { protocols } = args.constraints[0] as ProtocolConstraint;

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return false;
    }

    return protocols.includes(parsed.protocol.replace(/:$/, ''));
  }

  public defaultMessage(args: ValidationArguments): string {
    const { protocols } = args.constraints[0] as ProtocolConstraint;
    return `${args.property} must be an absolute URL using one of these protocols: ${protocols.join(', ')}`;
  }
}

export function IsUrlWithProtocol(
  protocols: readonly string[],
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function decorate(target: object, propertyName: string | symbol): void {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [{ protocols } satisfies ProtocolConstraint],
      validator: IsUrlWithProtocolConstraint,
    });
  };
}
