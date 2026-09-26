<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Individual public review pages share `ReviewDetailView` and `buildReviewJsonLd`; keep their mobile layout and structured review dates consistent with the selected `review_date`.
- Reviewer `index-info` routes share `ReviewerIndexInfo` and load published reviews live so all reviewer indexes stay consistent and current.
