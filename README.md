# barra-sessione

Una mod per Claude Code che mostra, sopra la casella dei messaggi, una riga di stato in italiano:

- **Cache**: quanto manca alla scadenza della cache del prompt (verde, poi gialla, poi rossa quando è scaduta). Dura 1 ora con un abbonamento sotto i limiti e 5 minuti con una chiave API.
- **Contesto**: token usati sulla finestra di contesto, con la percentuale.
- **5h** e **Sett.**: quanto hai usato dei limiti delle 5 ore e della settimana, e quando si rinnovano (solo con un abbonamento).
- **Sessione**: token usati nella sessione, sottoagenti compresi, e costo a prezzi API.

C'è anche un pulsante **Handoff**: fa scrivere a Claude un passaggio di consegne della sessione, pulisce la chat con `/clear` e lascia il riassunto nella casella come bozza, pronto da mandare a un agente nuovo.

Il comando `/token` mostra il riepilogo esteso con tutti i dettagli.

## Installazione

Al prompt di una sessione di Claude Code nel terminale:

```
/plugin install barra-sessione --marketplace oktaivlab/claude-barra-sessione
```

Rispondi `y` per aggiungere il marketplace, poi premi Invio per l'ambito utente.

Da una shell:

```bash
claude plugin install barra-sessione --marketplace oktaivlab/claude-barra-sessione
```

Nell'app desktop, dove `/plugin` non funziona: clicca su + accanto alla casella dei messaggi, poi Plugins, Add marketplace con `oktaivlab/claude-barra-sessione`, poi Add plugin.

## Test

```bash
claude plugin test .
```

## Licenza

MIT: vedi il file [LICENSE](LICENSE).
