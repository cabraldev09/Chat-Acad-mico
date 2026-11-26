import React, { useState } from "react";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CpfField, CurrencyField, EmailField, NameField, PhoneField } from "../components/MaskedFields";

afterEach(() => cleanup());

// a screen holding the clean value, as the real forms do
const Holder = ({ Field, initial = "", onValue, ...props }) => {
  const [v, setV] = useState(initial);
  return <Field id="campo" label="campo" value={v} onChange={(x) => { setV(x); if (onValue) onValue(x); }} {...props} />;
};
const input = () => screen.getByLabelText("campo");
const type = (text) => fireEvent.change(input(), { target: { value: text } });

describe("campos com trava", () => {
  it("CPF forma enquanto digita, guarda só os números e avisa quando é inválido", () => {
    let kept;
    render(<Holder Field={CpfField} onValue={(v) => { kept = v; }} />);
    type("1234567890");
    expect(input().value).toBe("123.456.789-0");
    type("123.456.789-09");
    expect(input().value).toBe("123.456.789-09");
    expect(kept).toBe("12345678909");
    type("11111111111");
    expect(screen.getByText(/CPF inválido/)).toBeTruthy();
  });

  it("telefone forma enquanto digita e avisa incompleto ao sair do campo", () => {
    let kept;
    render(<Holder Field={PhoneField} onValue={(v) => { kept = v; }} />);
    type("69999998888");
    expect(input().value).toBe("(69) 99999-8888");
    expect(kept).toBe("69999998888");
    type("6999");
    fireEvent.blur(input());
    expect(screen.getByText(/Telefone incompleto/)).toBeTruthy();
  });

  it("e-mail sempre minúsculo e sem espaço", () => {
    let kept;
    render(<Holder Field={EmailField} onValue={(v) => { kept = v; }} />);
    type(" Maria@Gmail.COM");
    expect(kept).toBe("maria@gmail.com");
  });

  it("nome com a primeira letra maiúscula, e os espaços sobrando saem ao sair do campo", () => {
    let kept;
    render(<Holder Field={NameField} onValue={(v) => { kept = v; }} />);
    type("joão DA silva ");
    expect(input().value).toBe("João da Silva ");
    fireEvent.blur(input());
    expect(kept).toBe("João da Silva");
  });

  it("valor em reais da direita para a esquerda: 12145 vira R$ 121,45 e entrega 121.45", () => {
    let kept;
    render(<Holder Field={CurrencyField} initial={null} onValue={(v) => { kept = v; }} />);
    type("12145");
    expect(input().value).toBe("R$ 121,45");
    expect(kept).toBe(121.45);
    type("R$ 121,453");
    expect(input().value).toBe("R$ 1.214,53");
    type("R$ 0,0");
    expect(input().value).toBe("");
    expect(kept).toBe(null);
  });

  it("uma taxa que pode ser isenta fica em R$ 0,00 quando apagada", () => {
    let kept;
    render(<Holder Field={CurrencyField} initial={99} emptyValue={0} onValue={(v) => { kept = v; }} />);
    expect(input().value).toBe("R$ 99,00");
    type("");
    expect(kept).toBe(0);
    expect(input().value).toBe("R$ 0,00");
  });
});
