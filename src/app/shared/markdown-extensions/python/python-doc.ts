import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPlayground } from '../../markdown-playground/markdown-playground';

/**
 * Page de documentation du langage ```python — montée par DocsShell (slug
 * `python`, cf. PYTHON_EXTENSION.doc). Prose via i18n `docs.python.*`.
 */
@Component({
  selector: 'app-python-doc',
  imports: [MarkdownPlayground, TranslocoPipe],
  templateUrl: './python-doc.html',
})
export class PythonDoc {
  protected readonly firstExample = `\`\`\`python
for i in range(1, 6):
    print(i, "au carré vaut", i ** 2)
\`\`\``;

  protected readonly inputExample = `\`\`\`python
prenom = input("Quel est ton prénom ? ")
age = int(input("Quel âge as-tu ? "))
print(f"Bonjour {prenom}, dans dix ans tu auras {age + 10} ans.")
\`\`\``;

  protected readonly numpyExample = `\`\`\`python
import numpy as np

notes = np.array([12, 15.5, 9, 17, 13.5])
print("moyenne :", notes.mean())
print("écart type :", round(notes.std(), 2))
\`\`\``;

  protected readonly plotExample = `\`\`\`python
import numpy as np
import matplotlib.pyplot as plt

t = np.linspace(0, 2, 100)
plt.plot(t, 4.9 * t ** 2, label="chute libre")
plt.xlabel("t (s)")
plt.ylabel("distance parcourue (m)")
plt.legend()
plt.show()
\`\`\``;

  protected readonly errorExample = `\`\`\`python
notes = [12, 15, 9]
print(sum(notes) / len(note))
\`\`\``;
}
