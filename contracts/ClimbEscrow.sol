// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title ClimbEscrow
/// @notice USDC-funded social bounties with solo acceptance or contribution-weighted voting.
/// @dev Intended for six-decimal USDC on Arc Testnet, supplied at deployment.
/// Fee-on-transfer and rebasing tokens are not supported. Fees use the settings at payout time.
/// Contribution records remain historical after payment; Paid bounties cannot refund or withdraw.
contract ClimbEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_FEE_BPS = 500;
    uint256 public constant MIN_BOUNTY_AMOUNT = 1e6;
    uint256 public constant MIN_CONTRIBUTION = 1e5;
    uint256 public constant VOTING_PERIOD = 48 hours;
    uint64 public constant NOMINATION_COOLDOWN = 24 hours;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    enum Status { Active, Voting, Paid, Cancelled }

    struct Bounty {
        uint256 id;
        address creator;
        string title;
        string description;
        uint256 totalFunds;
        bool isOpen;
        Status status;
        uint64 createdAt;
        uint256 nominatedClaimId;
        uint64 voteEndsAt;
        uint256 yesWeight;
        uint256 noWeight;
        uint32 voteRound;
        /// @notice Optional category, limited to 32 bytes.
        string category;
    }

    struct Claim {
        uint256 id;
        uint256 bountyId;
        address claimant;
        string proofURI;
        string note;
        uint64 createdAt;
    }

    IERC20 public immutable usdc;
    address public treasury;
    uint16 public feeBps;

    uint256 private _bountyCount;
    mapping(uint256 => Bounty) private _bounties;
    mapping(uint256 => Claim[]) private _claims;
    mapping(uint256 => mapping(address => uint256)) private _contributions;
    mapping(uint256 => address[]) private _contributors;
    mapping(uint256 => mapping(address => bool)) public isContributor;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    mapping(uint256 => mapping(uint32 => mapping(address => bool))) private _hasVoted;
    /// @notice Deferred amounts are held for the recipient only; the owner cannot touch them.
    mapping(address => uint256) public pendingPayouts;
    /// @notice Failed votes leave 24 hours for active-bounty actions before re-nomination; first nominations have no cooldown.
    mapping(uint256 => uint64) public nominationAvailableAt;

    error ZeroAddress();
    error FeeTooHigh();
    error BountyNotFound();
    error ClaimNotFound();
    error InvalidTitleLength();
    error DescriptionTooLong();
    error CategoryTooLong();
    error CommentEmpty();
    error CommentTooLong();
    error InvalidProofURILength();
    error NoteTooLong();
    error AmountTooSmall();
    error OpenBountyRequired();
    error SoloBountyRequired();
    error NotBountyCreator();
    error InvalidBountyStatus();
    error ClaimantCannotContribute();
    error CreatorCannotWithdraw();
    error NothingToWithdraw();
    error CreatorCannotClaim();
    error ContributorCannotClaim();
    error NoContribution();
    error AlreadyVoted();
    error VotingEnded();
    error VotingNotEnded();
    error NominationCooldown();
    error NothingToRefund();
    error NothingPending();

    event BountyCreated(uint256 indexed bountyId, address indexed creator, string title, string category, uint256 amount, bool isOpen);
    /// @notice Event-only comment on an existing bounty.
    event CommentAdded(uint256 indexed bountyId, address indexed author, string text, uint256 timestamp);
    event Contributed(uint256 indexed bountyId, address indexed contributor, uint256 amount);
    event ContributionWithdrawn(uint256 indexed bountyId, address indexed contributor, uint256 amount);
    event ClaimSubmitted(uint256 indexed bountyId, uint256 indexed claimId, address indexed claimant);
    event ClaimNominated(uint256 indexed bountyId, uint256 indexed claimId, address indexed creator, uint32 voteRound, uint64 voteEndsAt);
    event Voted(uint256 indexed bountyId, address indexed voter, uint32 voteRound, bool support, uint256 weight);
    event VoteResolved(uint256 indexed bountyId, bool passed, uint256 yesWeight, uint256 noWeight);
    event BountyPaid(uint256 indexed bountyId, uint256 indexed claimId, address indexed claimant, uint256 payout, uint256 fee);
    event BountyCancelled(uint256 indexed bountyId, address indexed creator);
    event RefundClaimed(uint256 indexed bountyId, address indexed contributor, uint256 amount);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event FeeUpdated(uint16 previousFeeBps, uint16 newFeeBps);
    event PayoutDeferred(uint256 indexed bountyId, address indexed to, uint256 amount);
    event PendingWithdrawn(address indexed to, uint256 amount);

    /// @param usdc_ Six-decimal ERC-20 USDC address; never hardcoded.
    /// @param treasury_ Recipient of payout fees.
    /// @param feeBps_ Initial fee in basis points (250 represents 2.5%; maximum 500).
    /// @param owner_ Administrator of treasury and fee settings only, besides standard ownership management.
    constructor(address usdc_, address treasury_, uint16 feeBps_, address owner_) Ownable(owner_) {
        if (usdc_ == address(0) || treasury_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        usdc = IERC20(usdc_);
        treasury = treasury_;
        feeBps = feeBps_;
    }

    /// @notice Create a bounty and escrow at least one USDC; requires token approval.
    /// @param category Optional category of at most 32 bytes.
    function createBounty(string calldata title, string calldata description, string calldata category, uint256 amount, bool isOpen)
        external nonReentrant returns (uint256 id)
    {
        uint256 titleLength = bytes(title).length;
        if (titleLength == 0 || titleLength > 120) revert InvalidTitleLength();
        if (bytes(description).length > 2000) revert DescriptionTooLong();
        if (bytes(category).length > 32) revert CategoryTooLong();
        if (amount < MIN_BOUNTY_AMOUNT) revert AmountTooSmall();

        id = ++_bountyCount;
        Bounty storage bounty = _bounties[id];
        bounty.id = id;
        bounty.creator = msg.sender;
        bounty.title = title;
        bounty.description = description;
        bounty.totalFunds = amount;
        bounty.isOpen = isOpen;
        bounty.status = Status.Active;
        bounty.createdAt = uint64(block.timestamp);
        bounty.category = category;
        _contributions[id][msg.sender] = amount;
        isContributor[id][msg.sender] = true;
        _contributors[id].push(msg.sender);

        emit BountyCreated(id, msg.sender, title, category, amount, isOpen);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Anyone may emit a comment on an existing bounty, regardless of status.
    /// @param text Comment text of 1 to 500 bytes; not stored on-chain.
    function addComment(uint256 bountyId, string calldata text) external {
        _requireBounty(bountyId);
        uint256 textLength = bytes(text).length;
        if (textLength == 0) revert CommentEmpty();
        if (textLength > 500) revert CommentTooLong();
        emit CommentAdded(bountyId, msg.sender, text, block.timestamp);
    }

    /// @notice Add at least 0.1 USDC to an active open bounty; claimants cannot fund it.
    function contribute(uint256 bountyId, uint256 amount) external nonReentrant {
        Bounty storage bounty = _requireBounty(bountyId);
        if (!bounty.isOpen) revert OpenBountyRequired();
        if (bounty.status != Status.Active) revert InvalidBountyStatus();
        if (amount < MIN_CONTRIBUTION) revert AmountTooSmall();
        if (hasClaimed[bountyId][msg.sender]) revert ClaimantCannotContribute();

        _contributions[bountyId][msg.sender] += amount;
        bounty.totalFunds += amount;
        if (!isContributor[bountyId][msg.sender]) {
            isContributor[bountyId][msg.sender] = true;
            _contributors[bountyId].push(msg.sender);
        }

        emit Contributed(bountyId, msg.sender, amount);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Non-creators may withdraw their entire contribution while an open bounty is active.
    function withdrawContribution(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _requireBounty(bountyId);
        if (!bounty.isOpen) revert OpenBountyRequired();
        if (bounty.status != Status.Active) revert InvalidBountyStatus();
        if (msg.sender == bounty.creator) revert CreatorCannotWithdraw();
        uint256 amount = _contributions[bountyId][msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        _contributions[bountyId][msg.sender] = 0;
        bounty.totalFunds -= amount;
        emit ContributionWithdrawn(bountyId, msg.sender, amount);
        usdc.safeTransfer(msg.sender, amount);
    }

    /// @notice Submit proof while active or voting. Multiple claims per eligible address are allowed.
    /// @return claimId Zero-based index in this bounty's claim array.
    function submitClaim(uint256 bountyId, string calldata proofURI, string calldata note)
        external returns (uint256 claimId)
    {
        Bounty storage bounty = _requireBounty(bountyId);
        if (bounty.status != Status.Active && bounty.status != Status.Voting) revert InvalidBountyStatus();
        if (msg.sender == bounty.creator) revert CreatorCannotClaim();
        if (_contributions[bountyId][msg.sender] != 0) revert ContributorCannotClaim();
        uint256 proofLength = bytes(proofURI).length;
        if (proofLength == 0 || proofLength > 512) revert InvalidProofURILength();
        if (bytes(note).length > 500) revert NoteTooLong();

        claimId = _claims[bountyId].length;
        _claims[bountyId].push(Claim({
            id: claimId,
            bountyId: bountyId,
            claimant: msg.sender,
            proofURI: proofURI,
            note: note,
            createdAt: uint64(block.timestamp)
        }));
        hasClaimed[bountyId][msg.sender] = true;
        emit ClaimSubmitted(bountyId, claimId, msg.sender);
    }

    /// @notice The solo bounty creator selects a claim and pays its claimant immediately.
    function acceptClaim(uint256 bountyId, uint256 claimId) external nonReentrant {
        Bounty storage bounty = _requireBounty(bountyId);
        if (bounty.isOpen) revert SoloBountyRequired();
        if (msg.sender != bounty.creator) revert NotBountyCreator();
        if (bounty.status != Status.Active) revert InvalidBountyStatus();
        if (claimId >= _claims[bountyId].length) revert ClaimNotFound();
        _payout(bounty, claimId);
    }

    /// @notice Nominate a claim for a fresh 48-hour round; funding and withdrawals are locked during voting.
    function nominateClaim(uint256 bountyId, uint256 claimId) external {
        Bounty storage bounty = _requireBounty(bountyId);
        if (!bounty.isOpen) revert OpenBountyRequired();
        if (msg.sender != bounty.creator) revert NotBountyCreator();
        if (bounty.status != Status.Active) revert InvalidBountyStatus();
        if (block.timestamp < nominationAvailableAt[bountyId]) revert NominationCooldown();
        if (claimId >= _claims[bountyId].length) revert ClaimNotFound();

        bounty.status = Status.Voting;
        bounty.nominatedClaimId = claimId;
        bounty.voteRound += 1;
        bounty.yesWeight = 0;
        bounty.noWeight = 0;
        bounty.voteEndsAt = uint64(block.timestamp + VOTING_PERIOD);
        emit ClaimNominated(bountyId, claimId, msg.sender, bounty.voteRound, bounty.voteEndsAt);
    }

    /// @notice Cast one vote per round, weighted by the caller's locked contribution.
    function vote(uint256 bountyId, bool support) external {
        Bounty storage bounty = _requireBounty(bountyId);
        if (bounty.status != Status.Voting) revert InvalidBountyStatus();
        if (block.timestamp >= bounty.voteEndsAt) revert VotingEnded();
        uint256 weight = _contributions[bountyId][msg.sender];
        if (weight == 0) revert NoContribution();
        if (_hasVoted[bountyId][bounty.voteRound][msg.sender]) revert AlreadyVoted();

        _hasVoted[bountyId][bounty.voteRound][msg.sender] = true;
        if (support) {
            bounty.yesWeight += weight;
        } else {
            bounty.noWeight += weight;
        }
        emit Voted(bountyId, msg.sender, bounty.voteRound, support, weight);
    }

    /// @notice Resolve an expired vote. Only a strict yes majority of votes cast pays out; no quorum applies.
    function resolveVote(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _requireBounty(bountyId);
        if (bounty.status != Status.Voting) revert InvalidBountyStatus();
        if (block.timestamp < bounty.voteEndsAt) revert VotingNotEnded();

        bool passed = bounty.yesWeight > bounty.noWeight;
        emit VoteResolved(bountyId, passed, bounty.yesWeight, bounty.noWeight);
        if (passed) {
            _payout(bounty, bounty.nominatedClaimId);
        } else {
            nominationAvailableAt[bountyId] = uint64(block.timestamp + NOMINATION_COOLDOWN);
            bounty.status = Status.Active;
        }
    }

    /// @notice Cancel an active bounty; each funder must subsequently pull their own refund.
    function cancelBounty(uint256 bountyId) external {
        Bounty storage bounty = _requireBounty(bountyId);
        if (msg.sender != bounty.creator) revert NotBountyCreator();
        if (bounty.status != Status.Active) revert InvalidBountyStatus();
        bounty.status = Status.Cancelled;
        emit BountyCancelled(bountyId, msg.sender);
    }

    /// @notice Pull the caller's remaining contribution from a cancelled bounty, without a fee.
    function claimRefund(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _requireBounty(bountyId);
        if (bounty.status != Status.Cancelled) revert InvalidBountyStatus();
        uint256 amount = _contributions[bountyId][msg.sender];
        if (amount == 0) revert NothingToRefund();

        _contributions[bountyId][msg.sender] = 0;
        bounty.totalFunds -= amount;
        emit RefundClaimed(bountyId, msg.sender, amount);
        usdc.safeTransfer(msg.sender, amount);
    }

    /// @notice Withdraw the caller's deferred payouts, held for that recipient only and inaccessible to the owner.
    function withdrawPending() external nonReentrant {
        uint256 amount = pendingPayouts[msg.sender];
        if (amount == 0) revert NothingPending();

        pendingPayouts[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit PendingWithdrawn(msg.sender, amount);
    }

    /// @notice Update the destination for future payout fees, not escrow principal.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address previousTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previousTreasury, newTreasury);
    }

    /// @notice Update the fee applied at payout, capped at 5%.
    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        uint16 previousFeeBps = feeBps;
        feeBps = newFeeBps;
        emit FeeUpdated(previousFeeBps, newFeeBps);
    }

    /// @notice Return the last issued bounty id (zero before any creation).
    function bountyCount() external view returns (uint256) {
        return _bountyCount;
    }

    /// @notice Return a bounty, reverting if its id does not exist.
    function getBounty(uint256 bountyId) external view returns (Bounty memory) {
        return _requireBounty(bountyId);
    }

    /// @notice Read a clamped page of claims; an out-of-range offset returns an empty array.
    function getClaims(uint256 bountyId, uint256 offset, uint256 limit) external view returns (Claim[] memory page) {
        _requireBounty(bountyId);
        Claim[] storage claims = _claims[bountyId];
        uint256 length = claims.length;
        if (offset >= length) return new Claim[](0);
        uint256 count = length - offset;
        if (limit < count) count = limit;
        page = new Claim[](count);
        for (uint256 i = 0; i < count; ++i) {
            page[i] = claims[offset + i];
        }
    }

    /// @notice Return the number of claims submitted for an existing bounty.
    function claimCount(uint256 bountyId) external view returns (uint256) {
        _requireBounty(bountyId);
        return _claims[bountyId].length;
    }

    /// @notice Return an address's contribution record; paid bounty records are historical.
    function getContribution(uint256 bountyId, address contributor) external view returns (uint256) {
        _requireBounty(bountyId);
        return _contributions[bountyId][contributor];
    }

    /// @notice Return all unique historical contributors, including any who subsequently withdrew or refunded.
    function getContributors(uint256 bountyId) external view returns (address[] memory) {
        _requireBounty(bountyId);
        return _contributors[bountyId];
    }

    /// @notice Whether an address voted in the bounty's current (most recently opened) round.
    function hasVoted(uint256 bountyId, address voter) external view returns (bool) {
        Bounty storage bounty = _requireBounty(bountyId);
        return _hasVoted[bountyId][bounty.voteRound][voter];
    }

    function _requireBounty(uint256 bountyId) private view returns (Bounty storage bounty) {
        bounty = _bounties[bountyId];
        if (bounty.id == 0) revert BountyNotFound();
    }

    /// @dev Called only from nonReentrant entry points after claim and status validation.
    function _payout(Bounty storage bounty, uint256 claimId) private {
        uint256 total = bounty.totalFunds;
        uint256 fee = Math.mulDiv(total, feeBps, BPS_DENOMINATOR);
        uint256 payout = total - fee;
        address claimant = _claims[bounty.id][claimId].claimant;
        address feeRecipient = treasury;

        bounty.status = Status.Paid;
        bounty.totalFunds = 0;
        emit BountyPaid(bounty.id, claimId, claimant, payout, fee);
        if (payout != 0 && !_trySend(claimant, payout)) {
            emit PayoutDeferred(bounty.id, claimant, payout);
        }
        if (fee != 0 && !_trySend(feeRecipient, fee)) {
            emit PayoutDeferred(bounty.id, feeRecipient, fee);
        }
    }

    /// @dev Credits failed transfers to the recipient only; the caller emits the bounty-specific event.
    function _trySend(address to, uint256 amount) internal returns (bool success) {
        (bool called, bytes memory returndata) = address(usdc).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        success = called && (returndata.length == 0 ||
            (returndata.length >= 32 && bytes32(returndata) == bytes32(uint256(1))));
        if (!success) pendingPayouts[to] += amount;
    }
}
